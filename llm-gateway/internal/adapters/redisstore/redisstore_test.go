package redisstore

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

// newStore returns a Store backed by a real Redis when REDIS_URL is set
// (CI service container), otherwise by miniredis.
func newStore(t *testing.T) *Store {
	t.Helper()
	if url := os.Getenv("REDIS_URL"); url != "" {
		s, err := New(context.Background(), url, "test:"+t.Name()+":")
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			ctx := context.Background()
			keys, _ := s.rdb.Keys(ctx, s.prefix+"*").Result()
			if len(keys) > 0 {
				s.rdb.Del(ctx, keys...)
			}
			_ = s.Close()
		})
		return s
	}
	mr := miniredis.RunT(t)
	return NewFromClient(redis.NewClient(&redis.Options{Addr: mr.Addr()}), "test:")
}

func TestRedisRateLimiter(t *testing.T) {
	s := newStore(t)
	l := s.RateLimiter()
	ctx := context.Background()
	for i := range 3 {
		d, err := l.Take(ctx, "k", 1, 0.001, 3, false)
		if err != nil {
			t.Fatal(err)
		}
		if !d.Allowed {
			t.Fatalf("request %d should be allowed", i)
		}
	}
	d, err := l.Take(ctx, "k", 1, 0.001, 3, false)
	if err != nil {
		t.Fatal(err)
	}
	if d.Allowed || d.RetryAfter <= 0 {
		t.Fatalf("expected rejection with retry-after, got %+v", d)
	}
	d, _ = l.Take(ctx, "k", 5, 0.001, 3, true)
	if !d.Allowed || d.Remaining > -4 {
		t.Fatalf("forced take should go negative: %+v", d)
	}
}

func TestRedisUsageStore(t *testing.T) {
	s := newStore(t)
	u := s.UsageStore()
	ctx := context.Background()
	if err := u.Record(ctx, core.UsageRecord{Tenant: "acme", Period: "2026-10", Model: "chat|x", Usage: core.Usage{PromptTokens: 100, CompletionTokens: 50}, CostNanos: 2_000_000}); err != nil {
		t.Fatal(err)
	}
	if err := u.Record(ctx, core.UsageRecord{Tenant: "acme", Period: "2026-10", Model: "chat|x", CacheHit: true}); err != nil {
		t.Fatal(err)
	}
	got, err := u.Get(ctx, "acme", "2026-10")
	if err != nil {
		t.Fatal(err)
	}
	if got.Requests != 2 || got.CacheHits != 1 || got.TotalTokens != 150 || got.CostUSD != 0.002 {
		t.Fatalf("unexpected %+v", got)
	}
	if m := got.ByModel["chat|x"]; m.Requests != 2 || m.PromptTokens != 100 {
		t.Fatalf("by model %+v", got.ByModel)
	}
}

func TestRedisKV(t *testing.T) {
	s := newStore(t)
	kv := s.KV()
	ctx := context.Background()
	if _, ok, err := kv.Get(ctx, "missing"); ok || err != nil {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if err := kv.Set(ctx, "a", []byte("1"), time.Minute); err != nil {
		t.Fatal(err)
	}
	if v, ok, _ := kv.Get(ctx, "a"); !ok || string(v) != "1" {
		t.Fatalf("got %q", v)
	}
	if ok, _ := kv.SetNX(ctx, "a", []byte("2"), time.Minute); ok {
		t.Fatal("SetNX overwrote")
	}
	if ok, _ := kv.SetNX(ctx, "b", []byte("2"), time.Minute); !ok {
		t.Fatal("SetNX failed on new key")
	}
	_ = kv.Delete(ctx, "a")
	if _, ok, _ := kv.Get(ctx, "a"); ok {
		t.Fatal("not deleted")
	}
	if err := s.Ping(ctx); err != nil {
		t.Fatal(err)
	}
}
