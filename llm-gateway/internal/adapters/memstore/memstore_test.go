package memstore

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

func TestRateLimiterTokenBucket(t *testing.T) {
	c := &clock{t: time.Unix(1000, 0)}
	l := NewRateLimiter(c.now)
	ctx := context.Background()
	// 60/min = 1 per second, burst 3.
	for i := range 3 {
		d, _ := l.Take(ctx, "k", 1, 1, 3, false)
		if !d.Allowed {
			t.Fatalf("request %d should be allowed within burst", i)
		}
	}
	d, _ := l.Take(ctx, "k", 1, 1, 3, false)
	if d.Allowed || d.RetryAfter != time.Second {
		t.Fatalf("expected rejection with 1s retry, got %+v", d)
	}
	c.t = c.t.Add(1500 * time.Millisecond)
	if d, _ := l.Take(ctx, "k", 1, 1, 3, false); !d.Allowed {
		t.Fatal("bucket should have refilled one token")
	}
	// force drives the bucket negative (reconciliation).
	d, _ = l.Take(ctx, "k", 10, 1, 3, true)
	if !d.Allowed || d.Remaining >= 0 {
		t.Fatalf("forced take: %+v", d)
	}
	// Other keys are independent.
	if d, _ := l.Take(ctx, "other", 1, 1, 3, false); !d.Allowed {
		t.Fatal("independent key must be allowed")
	}
}

func TestUsageStore(t *testing.T) {
	s := NewUsageStore()
	ctx := context.Background()
	_ = s.Record(ctx, core.UsageRecord{Tenant: "t", Period: "2026-10", Model: "m", Usage: core.Usage{PromptTokens: 10, CompletionTokens: 5}, CostNanos: 1500})
	_ = s.Record(ctx, core.UsageRecord{Tenant: "t", Period: "2026-10", Model: "m", CacheHit: true})
	u, _ := s.Get(ctx, "t", "2026-10")
	if u.Requests != 2 || u.CacheHits != 1 || u.TotalTokens != 15 || u.ByModel["m"].Requests != 2 {
		t.Fatalf("unexpected usage %+v", u)
	}
	if u.CostUSD != 1.5e-6 {
		t.Fatalf("cost=%v", u.CostUSD)
	}
	empty, _ := s.Get(ctx, "t", "2026-09")
	if empty.Requests != 0 {
		t.Fatal("periods must be isolated")
	}
}

func TestKVTTLAndLRU(t *testing.T) {
	c := &clock{t: time.Unix(0, 0)}
	kv := NewKV(2, c.now)
	ctx := context.Background()
	_ = kv.Set(ctx, "a", []byte("1"), time.Second)
	_ = kv.Set(ctx, "b", []byte("2"), 0)
	if _, ok, _ := kv.Get(ctx, "a"); !ok {
		t.Fatal("a should exist")
	}
	_ = kv.Set(ctx, "c", []byte("3"), 0) // evicts LRU "b" (a was touched)
	if _, ok, _ := kv.Get(ctx, "b"); ok {
		t.Fatal("b should be evicted")
	}
	c.t = c.t.Add(2 * time.Second)
	if _, ok, _ := kv.Get(ctx, "a"); ok {
		t.Fatal("a should be expired")
	}
	ok, _ := kv.SetNX(ctx, "c", []byte("x"), 0)
	if ok {
		t.Fatal("SetNX must not overwrite")
	}
	ok, _ = kv.SetNX(ctx, "a", []byte("x"), 0)
	if !ok {
		t.Fatal("SetNX must write an expired key")
	}
	_ = kv.Delete(ctx, "a")
	if _, ok, _ := kv.Get(ctx, "a"); ok {
		t.Fatal("deleted")
	}
}

func BenchmarkRateLimiterParallel(b *testing.B) {
	l := NewRateLimiter(nil)
	ctx := context.Background()
	b.ReportAllocs()
	b.RunParallel(func(pb *testing.PB) {
		i := 0
		for pb.Next() {
			_, _ = l.Take(ctx, fmt.Sprintf("tenant-%d", i%64), 1, 1e9, 1e9, false)
			i++
		}
	})
}
