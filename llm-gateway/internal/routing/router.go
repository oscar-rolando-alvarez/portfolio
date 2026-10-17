package routing

import (
	"cmp"
	"context"
	"errors"
	"math"
	"math/rand/v2"
	"net/http"
	"slices"
	"sync"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/config"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

// Target is a resolved provider model behind an alias.
type Target struct {
	config.Target
	Provider core.Provider
}

// EstimateCostUSD returns the expected cost for the given token counts.
func (t Target) EstimateCostUSD(promptTokens, completionTokens int) float64 {
	return (float64(promptTokens)*t.InputCostPerMTok + float64(completionTokens)*t.OutputCostPerMTok) / 1e6
}

// Route is a model alias with its resolved targets and resilience policy.
type Route struct {
	Alias   string
	Kind    string
	Policy  string
	Targets []Target
	Timeout time.Duration
	Retry   config.Retry
	Hedge   config.Hedge
	Breaker config.CircuitBreaker
}

// Observer receives routing events (implemented by telemetry).
type Observer interface {
	Attempt(alias, target string, err error, d time.Duration)
	Fallback(alias, from, to string)
	BreakerState(target, state string)
	Hedge(alias, winner string)
}

type nopObserver struct{}

func (nopObserver) Attempt(string, string, error, time.Duration) {}
func (nopObserver) Fallback(string, string, string)              {}
func (nopObserver) BreakerState(string, string)                  {}
func (nopObserver) Hedge(string, string)                         {}

// Registry holds per-target runtime state (breakers, latency EWMA). It is
// shared across config reloads so health knowledge is not lost.
type Registry struct {
	mu       sync.Mutex
	breakers map[string]*Breaker
	latency  map[string]*ewma
	obs      Observer
	now      func() time.Time
	sleep    func(context.Context, time.Duration) error
	rnd      func() float64
}

// NewRegistry creates a registry. obs may be nil.
func NewRegistry(obs Observer) *Registry {
	if obs == nil {
		obs = nopObserver{}
	}
	return &Registry{
		breakers: map[string]*Breaker{},
		latency:  map[string]*ewma{},
		obs:      obs,
		now:      time.Now,
		sleep:    sleepCtx,
		rnd:      rand.Float64, // jitter and weighted choice need no CSPRNG
	}
}

// Breaker returns (creating if needed) the breaker for a target.
func (r *Registry) Breaker(id string, cfg config.CircuitBreaker) *Breaker {
	r.mu.Lock()
	defer r.mu.Unlock()
	b, ok := r.breakers[id]
	if !ok {
		b = NewBreaker(cfg.FailureThreshold, cfg.OpenFor, func() time.Time { return r.now() },
			func(s string) { r.obs.BreakerState(id, s) })
		r.breakers[id] = b
	} else {
		b.Configure(cfg.FailureThreshold, cfg.OpenFor)
	}
	return b
}

// BreakerStates snapshots all breaker states.
func (r *Registry) BreakerStates() map[string]string {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make(map[string]string, len(r.breakers))
	for k, b := range r.breakers {
		out[k] = b.State()
	}
	return out
}

// Latency returns the EWMA latency of a target (0 if unknown).
func (r *Registry) Latency(id string) time.Duration {
	r.mu.Lock()
	defer r.mu.Unlock()
	if e, ok := r.latency[id]; ok {
		return e.get()
	}
	return 0
}

func (r *Registry) observeLatency(id string, d time.Duration) {
	r.mu.Lock()
	e, ok := r.latency[id]
	if !ok {
		e = &ewma{}
		r.latency[id] = e
	}
	r.mu.Unlock()
	e.observe(d)
}

type ewma struct {
	mu  sync.Mutex
	v   float64
	set bool
}

const ewmaAlpha = 0.2

func (e *ewma) observe(d time.Duration) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if !e.set {
		e.v, e.set = float64(d), true
		return
	}
	e.v = ewmaAlpha*float64(d) + (1-ewmaAlpha)*e.v
}

func (e *ewma) get() time.Duration {
	e.mu.Lock()
	defer e.mu.Unlock()
	return time.Duration(e.v)
}

// Plan orders the targets of a route according to its policy. The first
// element is the primary; the rest form the fallback chain. Targets whose
// breaker is open are moved to the end (they are skipped at execution time
// unless their cool-down elapsed).
func (r *Registry) Plan(route *Route, promptTokens, completionTokens int) []Target {
	ts := slices.Clone(route.Targets)
	switch route.Policy {
	case config.PolicyWeighted:
		ts = r.weightedOrder(ts)
	case config.PolicyCost:
		slices.SortStableFunc(ts, func(a, b Target) int {
			return cmp.Compare(a.EstimateCostUSD(promptTokens, completionTokens), b.EstimateCostUSD(promptTokens, completionTokens))
		})
	case config.PolicyLatency:
		// Unknown latency sorts first so new targets get explored.
		slices.SortStableFunc(ts, func(a, b Target) int {
			return cmp.Compare(r.Latency(a.ID()), r.Latency(b.ID()))
		})
	}
	ready := ts[:0:0]
	var blocked []Target
	for _, t := range ts {
		if r.Breaker(t.ID(), route.Breaker).Ready() {
			ready = append(ready, t)
		} else {
			blocked = append(blocked, t)
		}
	}
	return append(ready, blocked...)
}

// weightedOrder picks the primary by weighted random choice and orders the
// remaining targets by descending weight.
func (r *Registry) weightedOrder(ts []Target) []Target {
	total := 0
	for _, t := range ts {
		total += t.Weight
	}
	if total <= 0 || len(ts) < 2 {
		return ts
	}
	pick := r.rnd() * float64(total)
	idx := len(ts) - 1
	for i, t := range ts {
		pick -= float64(t.Weight)
		if pick < 0 {
			idx = i
			break
		}
	}
	primary := ts[idx]
	rest := append(slices.Clone(ts[:idx]), ts[idx+1:]...)
	slices.SortStableFunc(rest, func(a, b Target) int { return cmp.Compare(b.Weight, a.Weight) })
	return append([]Target{primary}, rest...)
}

// Attempt records one call to a target.
type Attempt struct {
	Target   string        `json:"target"`
	Error    string        `json:"error,omitempty"`
	Duration time.Duration `json:"duration"`
	Skipped  bool          `json:"skipped,omitempty"`
}

// Result describes the outcome of Execute.
type Result[T any] struct {
	Value    T
	Target   Target
	Attempts []Attempt
	Hedged   bool
	// Release must be called when keepAlive was requested (streaming) to
	// free the attempt context once the caller is done with Value.
	Release func()
}

// Fallbacks returns how many times execution moved to another target.
func (r Result[T]) Fallbacks() int {
	seen := map[string]bool{}
	for _, a := range r.Attempts {
		if !a.Skipped {
			seen[a.Target] = true
		}
	}
	n := len(seen) - 1
	if r.Hedged {
		n-- // the speculative leg is not a fallback
	}
	return max(n, 0)
}

// ErrNoTargets is returned when every target is unavailable.
var ErrNoTargets = errors.New("no healthy target available")

var errAttemptTimeout = errors.New("attempt timeout")

// Call is a single provider invocation.
type Call[T any] func(ctx context.Context, t Target) (T, error)

// Options tune a single execution.
type Options struct {
	// KeepAlive keeps the successful attempt's context alive after Call
	// returns (streams); the per-attempt timeout then only bounds time to
	// the first chunk.
	KeepAlive bool
	// AllowHedge enables hedging if the route has it configured.
	AllowHedge bool
}

// Execute runs call against the plan with retries, breakers, fallback and
// optional hedging.
func Execute[T any](ctx context.Context, reg *Registry, route *Route, plan []Target, opts Options, call Call[T]) (Result[T], error) {
	var res Result[T]
	if len(plan) == 0 {
		return res, core.Errorf(http.StatusServiceUnavailable, core.CodeAllTargetsFailed, "route %q has no targets", route.Alias)
	}
	if opts.AllowHedge && route.Hedge.Enabled && len(plan) >= 2 && !opts.KeepAlive {
		return executeHedged(ctx, reg, route, plan, call)
	}
	var lastErr error
	var prev string
	for _, t := range plan {
		br := reg.Breaker(t.ID(), route.Breaker)
		if !br.Allow() {
			res.Attempts = append(res.Attempts, Attempt{Target: t.ID(), Skipped: true, Error: core.CodeCircuitOpen})
			continue
		}
		if prev != "" {
			reg.obs.Fallback(route.Alias, prev, t.ID())
		}
		prev = t.ID()
		v, release, attempts, err := runTarget(ctx, reg, route, t, br, opts.KeepAlive, call)
		res.Attempts = append(res.Attempts, attempts...)
		if err == nil {
			res.Value, res.Target, res.Release = v, t, release
			return res, nil
		}
		lastErr = err
		if ctx.Err() != nil || !core.IsRetryable(err) {
			// Client went away, overall deadline hit, or the request itself
			// is invalid: failing over would not help.
			return res, err
		}
	}
	if lastErr == nil {
		lastErr = core.Errorf(http.StatusServiceUnavailable, core.CodeCircuitOpen, "all targets for %q have open circuits", route.Alias)
		return res, lastErr
	}
	ge := core.AsError(lastErr)
	out := core.Errorf(http.StatusBadGateway, core.CodeAllTargetsFailed, "all targets for %q failed; last error: %s", route.Alias, ge.Message)
	out.Cause = lastErr
	if ge.Status == http.StatusTooManyRequests || ge.Status == http.StatusGatewayTimeout {
		out.Status = ge.Status
	}
	return res, out
}

// runTarget calls a single target with retries and backoff.
func runTarget[T any](ctx context.Context, reg *Registry, route *Route, t Target, br *Breaker, keepAlive bool, call Call[T]) (T, func(), []Attempt, error) {
	var zero T
	var attempts []Attempt
	maxAttempts := max(1, route.Retry.MaxAttempts)
	for i := range maxAttempts {
		if i > 0 && !br.Allow() {
			e := core.Errorf(http.StatusServiceUnavailable, core.CodeCircuitOpen, "circuit opened for %s", t.ID())
			e.Retryable = true // another target may still succeed
			return zero, nil, attempts, e
		}
		actx, cancel := context.WithCancelCause(ctx)
		timer := time.AfterFunc(route.Timeout, func() { cancel(errAttemptTimeout) })
		start := reg.now()
		v, err := call(actx, t)
		timedOut := !timer.Stop() && errors.Is(context.Cause(actx), errAttemptTimeout)
		d := reg.now().Sub(start)
		if err == nil {
			br.Success()
			reg.observeLatency(t.ID(), d)
			reg.obs.Attempt(route.Alias, t.ID(), nil, d)
			attempts = append(attempts, Attempt{Target: t.ID(), Duration: d})
			release := func() { cancel(context.Canceled) }
			if !keepAlive {
				release()
				release = func() {}
			}
			return v, release, attempts, nil
		}
		cancel(context.Canceled)
		if timedOut && ctx.Err() == nil {
			err = &core.Error{Status: http.StatusGatewayTimeout, Type: "api_error", Code: core.CodeUpstreamTimeout,
				Message: "attempt timed out after " + route.Timeout.String(), Retryable: true, Cause: context.DeadlineExceeded}
		}
		reg.obs.Attempt(route.Alias, t.ID(), err, d)
		attempts = append(attempts, Attempt{Target: t.ID(), Duration: d, Error: core.AsError(err).Code})
		if ctx.Err() != nil {
			br.Release()
			return zero, nil, attempts, ctx.Err()
		}
		if !core.IsRetryable(err) {
			// The upstream rejected the request itself; the target is healthy.
			br.Success()
			return zero, nil, attempts, err
		}
		br.Failure()
		if i == maxAttempts-1 {
			return zero, nil, attempts, err
		}
		if serr := reg.sleep(ctx, backoff(route.Retry, i, err, reg.rnd)); serr != nil {
			return zero, nil, attempts, serr
		}
	}
	return zero, nil, attempts, errors.New("unreachable")
}

// backoff computes full-jitter exponential backoff, honouring Retry-After
// hints from the upstream when they fit within MaxBackoff.
func backoff(cfg config.Retry, attempt int, err error, rnd func() float64) time.Duration {
	var ge *core.Error
	if errors.As(err, &ge) && ge.RetryAfter > 0 && ge.RetryAfter <= cfg.MaxBackoff {
		return ge.RetryAfter
	}
	ceil := float64(cfg.BaseBackoff) * math.Pow(2, float64(attempt))
	ceil = math.Min(ceil, float64(cfg.MaxBackoff))
	return time.Duration(rnd() * ceil)
}

func sleepCtx(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

type legResult[T any] struct {
	v        T
	t        Target
	attempts []Attempt
	err      error
	hedge    bool
}

// executeHedged starts the primary and, if it has not completed after
// Hedge.Delay, a speculative request to the next healthy target. The first
// success wins and the loser is cancelled. If both legs fail, the remaining
// targets are tried sequentially.
func executeHedged[T any](ctx context.Context, reg *Registry, route *Route, plan []Target, call Call[T]) (Result[T], error) {
	var res Result[T]
	hctx, cancelAll := context.WithCancel(ctx)
	defer cancelAll()

	results := make(chan legResult[T], 2)
	launch := func(t Target, br *Breaker, hedge bool) {
		go func() {
			v, _, at, err := runTarget(hctx, reg, route, t, br, false, call)
			results <- legResult[T]{v: v, t: t, attempts: at, err: err, hedge: hedge}
		}()
	}

	idx := 0
	next := func() (Target, *Breaker, bool) {
		for idx < len(plan) {
			t := plan[idx]
			idx++
			br := reg.Breaker(t.ID(), route.Breaker)
			if br.Allow() {
				return t, br, true
			}
			res.Attempts = append(res.Attempts, Attempt{Target: t.ID(), Skipped: true, Error: core.CodeCircuitOpen})
		}
		return Target{}, nil, false
	}

	primary, pbr, ok := next()
	if !ok {
		return res, core.Errorf(http.StatusServiceUnavailable, core.CodeCircuitOpen, "all targets for %q have open circuits", route.Alias)
	}
	launch(primary, pbr, false)
	inflight := 1
	hedgeTimer := time.NewTimer(route.Hedge.Delay)
	defer hedgeTimer.Stop()

	var lastErr error
	for inflight > 0 {
		select {
		case <-hedgeTimer.C:
			if t, br, ok := next(); ok {
				res.Hedged = true
				launch(t, br, true)
				inflight++
			}
		case r := <-results:
			inflight--
			res.Attempts = append(res.Attempts, r.attempts...)
			if r.err == nil {
				cancelAll()
				// Drain the loser so its goroutine can exit; its attempts are
				// recorded for the audit trail.
				for ; inflight > 0; inflight-- {
					l := <-results
					res.Attempts = append(res.Attempts, l.attempts...)
				}
				if res.Hedged {
					reg.obs.Hedge(route.Alias, r.t.ID())
				}
				res.Value, res.Target, res.Release = r.v, r.t, func() {}
				return res, nil
			}
			lastErr = r.err
			if ctx.Err() != nil || !core.IsRetryable(r.err) {
				cancelAll()
				for ; inflight > 0; inflight-- {
					<-results
				}
				return res, r.err
			}
			if inflight == 0 {
				hedgeTimer.Stop()
			}
		}
	}
	// Both hedged legs failed: continue sequentially with what is left.
	rest := plan[idx:]
	if len(rest) == 0 {
		ge := core.AsError(lastErr)
		out := core.Errorf(http.StatusBadGateway, core.CodeAllTargetsFailed, "all targets for %q failed; last error: %s", route.Alias, ge.Message)
		out.Cause = lastErr
		return res, out
	}
	tail, err := Execute(ctx, reg, route, rest, Options{}, call)
	tail.Attempts = append(res.Attempts, tail.Attempts...)
	tail.Hedged = res.Hedged
	return tail, err
}
