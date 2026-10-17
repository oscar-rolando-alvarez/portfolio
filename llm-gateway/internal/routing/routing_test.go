package routing

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/config"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

func TestBreakerStateMachine(t *testing.T) {
	clk := &fakeClock{t: time.Unix(0, 0)}
	var changes []string
	b := NewBreaker(2, 10*time.Second, clk.Now, func(s string) { changes = append(changes, s) })

	if !b.Allow() {
		t.Fatal("closed breaker must allow")
	}
	b.Failure()
	if b.State() != StateClosed {
		t.Fatal("one failure must not open")
	}
	b.Failure()
	if b.State() != StateOpen || b.Allow() {
		t.Fatal("threshold reached: breaker must be open and reject")
	}
	clk.Advance(10 * time.Second)
	if !b.Ready() {
		t.Fatal("cool-down elapsed: breaker must be ready for a probe")
	}
	if !b.Allow() {
		t.Fatal("first half-open probe must be allowed")
	}
	if b.Allow() {
		t.Fatal("only one concurrent half-open probe")
	}
	b.Failure()
	if b.State() != StateOpen {
		t.Fatal("failed probe must re-open")
	}
	clk.Advance(10 * time.Second)
	b.Allow()
	b.Success()
	if b.State() != StateClosed {
		t.Fatal("successful probe must close")
	}
	want := []string{StateOpen, StateHalfOpen, StateOpen, StateHalfOpen, StateClosed}
	if len(changes) != len(want) {
		t.Fatalf("changes=%v want %v", changes, want)
	}
	for i := range want {
		if changes[i] != want[i] {
			t.Fatalf("changes=%v want %v", changes, want)
		}
	}
}

func tgt(provider, model string, weight int, in, out float64) Target {
	return Target{Target: config.Target{Provider: provider, Model: model, Weight: weight, InputCostPerMTok: in, OutputCostPerMTok: out}}
}

func newTestRegistry() *Registry {
	r := NewRegistry(nil)
	r.sleep = func(context.Context, time.Duration) error { return nil }
	return r
}

func ids(ts []Target) []string {
	out := make([]string, len(ts))
	for i, t := range ts {
		out[i] = t.ID()
	}
	return out
}

func TestPlanPolicies(t *testing.T) {
	expensive := tgt("p1", "large", 1, 2.5, 10)
	cheap := tgt("p2", "small", 1, 0.15, 0.6)
	breaker := config.CircuitBreaker{FailureThreshold: 1, OpenFor: time.Minute}

	t.Run("priority keeps order", func(t *testing.T) {
		r := newTestRegistry()
		got := ids(r.Plan(&Route{Policy: config.PolicyPriority, Targets: []Target{expensive, cheap}, Breaker: breaker}, 100, 100))
		if got[0] != "p1/large" {
			t.Fatalf("got %v", got)
		}
	})
	t.Run("cost picks cheapest", func(t *testing.T) {
		r := newTestRegistry()
		got := ids(r.Plan(&Route{Policy: config.PolicyCost, Targets: []Target{expensive, cheap}, Breaker: breaker}, 100, 100))
		if got[0] != "p2/small" || got[1] != "p1/large" {
			t.Fatalf("got %v", got)
		}
	})
	t.Run("latency picks fastest", func(t *testing.T) {
		r := newTestRegistry()
		r.observeLatency("p1/large", 50*time.Millisecond)
		r.observeLatency("p2/small", 200*time.Millisecond)
		got := ids(r.Plan(&Route{Policy: config.PolicyLatency, Targets: []Target{cheap, expensive}, Breaker: breaker}, 1, 1))
		if got[0] != "p1/large" {
			t.Fatalf("got %v", got)
		}
	})
	t.Run("weighted distribution", func(t *testing.T) {
		r := newTestRegistry()
		a, b := tgt("a", "m", 90, 0, 0), tgt("b", "m", 10, 0, 0)
		route := &Route{Policy: config.PolicyWeighted, Targets: []Target{a, b}, Breaker: breaker}
		counts := map[string]int{}
		const n = 10_000
		for range n {
			counts[r.Plan(route, 1, 1)[0].ID()]++
		}
		if share := float64(counts["a/m"]) / n; share < 0.87 || share > 0.93 {
			t.Fatalf("weighted share for a=%.3f, want ~0.90", share)
		}
	})
	t.Run("open breaker moves target last", func(t *testing.T) {
		r := newTestRegistry()
		r.Breaker("p1/large", breaker).Failure()
		got := ids(r.Plan(&Route{Policy: config.PolicyPriority, Targets: []Target{expensive, cheap}, Breaker: breaker}, 1, 1))
		if got[0] != "p2/small" {
			t.Fatalf("got %v", got)
		}
	})
}

func route(targets ...Target) *Route {
	return &Route{
		Alias: "alias", Policy: config.PolicyPriority, Targets: targets, Timeout: time.Second,
		Retry:   config.Retry{MaxAttempts: 2, BaseBackoff: time.Millisecond, MaxBackoff: 10 * time.Millisecond},
		Breaker: config.CircuitBreaker{FailureThreshold: 3, OpenFor: time.Minute},
		Hedge:   config.Hedge{Delay: 20 * time.Millisecond},
	}
}

func TestExecuteRetryThenFallback(t *testing.T) {
	r := newTestRegistry()
	rt := route(tgt("bad", "m", 1, 0, 0), tgt("good", "m", 1, 0, 0))
	calls := map[string]int{}
	res, err := Execute(context.Background(), r, rt, rt.Targets, Options{}, func(_ context.Context, t Target) (string, error) {
		calls[t.ID()]++
		if t.Target.Provider == "bad" {
			return "", core.UpstreamError(http.StatusServiceUnavailable, "down", 0)
		}
		return "ok", nil
	})
	if err != nil || res.Value != "ok" {
		t.Fatalf("res=%+v err=%v", res, err)
	}
	if calls["bad/m"] != 2 || calls["good/m"] != 1 {
		t.Fatalf("calls=%v (want 2 retries on bad, 1 on good)", calls)
	}
	if res.Fallbacks() != 1 || res.Target.ID() != "good/m" {
		t.Fatalf("fallbacks=%d target=%s", res.Fallbacks(), res.Target.ID())
	}
}

func TestExecuteNonRetryableStops(t *testing.T) {
	r := newTestRegistry()
	rt := route(tgt("a", "m", 1, 0, 0), tgt("b", "m", 1, 0, 0))
	var calls atomic.Int32
	_, err := Execute(context.Background(), r, rt, rt.Targets, Options{}, func(context.Context, Target) (string, error) {
		calls.Add(1)
		return "", core.UpstreamError(http.StatusBadRequest, "bad param", 0)
	})
	if err == nil || calls.Load() != 1 {
		t.Fatalf("err=%v calls=%d: a 400 must not be retried or failed over", err, calls.Load())
	}
	if ge := core.AsError(err); ge.Status != http.StatusBadRequest {
		t.Fatalf("status=%d", ge.Status)
	}
	if r.Breaker("a/m", rt.Breaker).State() != StateClosed {
		t.Fatal("client errors must not trip the breaker")
	}
}

func TestExecuteAllFail(t *testing.T) {
	r := newTestRegistry()
	rt := route(tgt("a", "m", 1, 0, 0), tgt("b", "m", 1, 0, 0))
	_, err := Execute(context.Background(), r, rt, rt.Targets, Options{}, func(context.Context, Target) (string, error) {
		return "", core.UpstreamError(http.StatusBadGateway, "boom", 0)
	})
	if ge := core.AsError(err); ge.Code != core.CodeAllTargetsFailed || ge.Status != http.StatusBadGateway {
		t.Fatalf("err=%v", err)
	}
}

func TestExecuteBreakerOpensAndSkips(t *testing.T) {
	r := newTestRegistry()
	rt := route(tgt("a", "m", 1, 0, 0), tgt("b", "m", 1, 0, 0))
	rt.Retry.MaxAttempts = 1
	rt.Breaker.FailureThreshold = 2
	var aCalls atomic.Int32
	call := func(_ context.Context, t Target) (string, error) {
		if t.Target.Provider == "a" {
			aCalls.Add(1)
			return "", core.UpstreamError(http.StatusServiceUnavailable, "down", 0)
		}
		return "ok", nil
	}
	for range 5 {
		if _, err := Execute(context.Background(), r, rt, r.Plan(rt, 1, 1), Options{}, call); err != nil {
			t.Fatal(err)
		}
	}
	if aCalls.Load() != 2 {
		t.Fatalf("a called %d times; breaker should open after 2 failures", aCalls.Load())
	}
}

func TestExecuteAttemptTimeoutIsRetryable(t *testing.T) {
	r := newTestRegistry()
	rt := route(tgt("slow", "m", 1, 0, 0), tgt("fast", "m", 1, 0, 0))
	rt.Timeout = 20 * time.Millisecond
	rt.Retry.MaxAttempts = 1
	res, err := Execute(context.Background(), r, rt, rt.Targets, Options{}, func(ctx context.Context, t Target) (string, error) {
		if t.Target.Provider == "slow" {
			<-ctx.Done()
			return "", ctx.Err()
		}
		return "fast", nil
	})
	if err != nil || res.Value != "fast" {
		t.Fatalf("res=%v err=%v", res.Value, err)
	}
	if res.Attempts[0].Error != core.CodeUpstreamTimeout {
		t.Fatalf("attempts=%+v", res.Attempts)
	}
}

func TestExecuteClientCancelStops(t *testing.T) {
	r := newTestRegistry()
	rt := route(tgt("a", "m", 1, 0, 0), tgt("b", "m", 1, 0, 0))
	ctx, cancel := context.WithCancel(context.Background())
	var calls atomic.Int32
	_, err := Execute(ctx, r, rt, rt.Targets, Options{}, func(ctx context.Context, _ Target) (string, error) {
		calls.Add(1)
		cancel()
		<-ctx.Done()
		return "", ctx.Err()
	})
	if !errors.Is(err, context.Canceled) || calls.Load() != 1 {
		t.Fatalf("err=%v calls=%d", err, calls.Load())
	}
	if r.Breaker("a/m", rt.Breaker).State() != StateClosed {
		t.Fatal("client cancellation must not count against the target")
	}
}

func TestExecuteKeepAlive(t *testing.T) {
	r := newTestRegistry()
	rt := route(tgt("a", "m", 1, 0, 0))
	rt.Timeout = 10 * time.Millisecond
	var attemptCtx context.Context
	res, err := Execute(context.Background(), r, rt, rt.Targets, Options{KeepAlive: true}, func(ctx context.Context, _ Target) (string, error) {
		attemptCtx = ctx
		return "stream", nil
	})
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(30 * time.Millisecond)
	if attemptCtx.Err() != nil {
		t.Fatal("keep-alive context must outlive the time-to-first-byte timeout")
	}
	res.Release()
	if attemptCtx.Err() == nil {
		t.Fatal("Release must cancel the attempt context")
	}
}

func TestExecuteHedged(t *testing.T) {
	r := newTestRegistry()
	rt := route(tgt("slow", "m", 1, 0, 0), tgt("fast", "m", 1, 0, 0))
	rt.Hedge.Enabled = true
	var slowCancelled atomic.Bool
	start := time.Now()
	res, err := Execute(context.Background(), r, rt, rt.Targets, Options{AllowHedge: true}, func(ctx context.Context, t Target) (string, error) {
		if t.Target.Provider == "slow" {
			select {
			case <-time.After(2 * time.Second):
				return "slow", nil
			case <-ctx.Done():
				slowCancelled.Store(true)
				return "", ctx.Err()
			}
		}
		return "fast", nil
	})
	if err != nil || res.Value != "fast" || !res.Hedged {
		t.Fatalf("res=%+v err=%v", res, err)
	}
	if el := time.Since(start); el > time.Second {
		t.Fatalf("hedging did not cut latency: %v", el)
	}
	if !slowCancelled.Load() {
		t.Fatal("losing leg must be cancelled")
	}
	if res.Fallbacks() != 0 {
		t.Fatalf("hedge leg counted as fallback: %d", res.Fallbacks())
	}
}

func TestExecuteHedgedPrimaryFailsFast(t *testing.T) {
	r := newTestRegistry()
	rt := route(tgt("a", "m", 1, 0, 0), tgt("b", "m", 1, 0, 0), tgt("c", "m", 1, 0, 0))
	rt.Hedge.Enabled = true
	rt.Retry.MaxAttempts = 1
	res, err := Execute(context.Background(), r, rt, rt.Targets, Options{AllowHedge: true}, func(_ context.Context, t Target) (string, error) {
		if t.Target.Provider == "c" {
			return "c", nil
		}
		return "", core.UpstreamError(http.StatusServiceUnavailable, "down", 0)
	})
	if err != nil || res.Value != "c" {
		t.Fatalf("res=%v err=%v", res.Value, err)
	}
}

func TestBackoffHonoursRetryAfter(t *testing.T) {
	cfg := config.Retry{BaseBackoff: 100 * time.Millisecond, MaxBackoff: 2 * time.Second}
	err := core.UpstreamError(http.StatusTooManyRequests, "slow down", time.Second)
	if d := backoff(cfg, 0, err, func() float64 { return 0.5 }); d != time.Second {
		t.Fatalf("got %v", d)
	}
	if d := backoff(cfg, 3, errors.New("x"), func() float64 { return 1 }); d != 800*time.Millisecond {
		t.Fatalf("got %v", d)
	}
	if d := backoff(cfg, 10, errors.New("x"), func() float64 { return 1 }); d != 2*time.Second {
		t.Fatalf("cap not applied: %v", d)
	}
}

func BenchmarkPlanCost(b *testing.B) {
	r := newTestRegistry()
	rt := route(tgt("a", "m", 1, 2.5, 10), tgt("b", "m", 1, 0.15, 0.6), tgt("c", "m", 1, 1, 3))
	rt.Policy = config.PolicyCost
	b.ReportAllocs()
	for b.Loop() {
		r.Plan(rt, 500, 200)
	}
}
