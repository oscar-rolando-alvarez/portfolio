// Package memstore provides in-process implementations of the state ports
// (rate limiter, usage store, KV). They are used for tests, single-replica
// deployments and as a fallback when Redis is not configured.
package memstore

import (
	"container/list"
	"context"
	"hash/maphash"
	"math"
	"sync"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

// Clock abstracts time for tests.
type Clock func() time.Time

// ---------------------------------------------------------------- limiter

const shards = 32

type bucket struct {
	tokens float64
	last   time.Time
}

type limiterShard struct {
	mu      sync.Mutex
	buckets map[string]*bucket
}

// RateLimiter is a sharded in-memory token bucket limiter.
type RateLimiter struct {
	seed   maphash.Seed
	shards [shards]limiterShard
	now    Clock
}

// NewRateLimiter creates a limiter. now may be nil.
func NewRateLimiter(now Clock) *RateLimiter {
	if now == nil {
		now = time.Now
	}
	l := &RateLimiter{seed: maphash.MakeSeed(), now: now}
	for i := range l.shards {
		l.shards[i].buckets = map[string]*bucket{}
	}
	return l
}

// Take implements core.RateLimiter.
func (l *RateLimiter) Take(_ context.Context, key string, n, rate, burst float64, force bool) (core.Decision, error) {
	sh := &l.shards[maphash.String(l.seed, key)%shards]
	now := l.now()
	sh.mu.Lock()
	defer sh.mu.Unlock()
	b, ok := sh.buckets[key]
	if !ok {
		b = &bucket{tokens: burst, last: now}
		sh.buckets[key] = b
		if len(sh.buckets) > 50_000 {
			sweep(sh.buckets, now, rate, burst)
		}
	}
	elapsed := now.Sub(b.last).Seconds()
	if elapsed > 0 {
		b.tokens = math.Min(burst, b.tokens+elapsed*rate)
		b.last = now
	}
	if b.tokens >= n || force {
		b.tokens -= n
		return core.Decision{Allowed: true, Remaining: b.tokens}, nil
	}
	retry := time.Duration((n - b.tokens) / rate * float64(time.Second))
	return core.Decision{Allowed: false, Remaining: b.tokens, RetryAfter: retry}, nil
}

// sweep drops buckets that have fully refilled (they carry no state).
func sweep(m map[string]*bucket, now time.Time, rate, burst float64) {
	for k, b := range m {
		if b.tokens+now.Sub(b.last).Seconds()*rate >= burst {
			delete(m, k)
		}
	}
}

// ---------------------------------------------------------------- usage

// UsageStore keeps monthly usage in memory.
type UsageStore struct {
	mu   sync.Mutex
	data map[string]*core.UsageSummary
}

// NewUsageStore creates an empty store.
func NewUsageStore() *UsageStore { return &UsageStore{data: map[string]*core.UsageSummary{}} }

// Record implements core.UsageStore.
func (s *UsageStore) Record(_ context.Context, r core.UsageRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := r.Tenant + "|" + r.Period
	u, ok := s.data[k]
	if !ok {
		u = &core.UsageSummary{Tenant: r.Tenant, Period: r.Period, ByModel: map[string]core.ModelUsage{}}
		s.data[k] = u
	}
	u.Requests++
	if r.CacheHit {
		u.CacheHits++
	}
	u.PromptTokens += int64(r.Usage.PromptTokens)
	u.CompletionTokens += int64(r.Usage.CompletionTokens)
	u.TotalTokens += int64(r.Usage.PromptTokens + r.Usage.CompletionTokens)
	u.CostNanos += r.CostNanos
	u.CostUSD = float64(u.CostNanos) / 1e9
	if r.Model != "" {
		m := u.ByModel[r.Model]
		m.Requests++
		m.PromptTokens += int64(r.Usage.PromptTokens)
		m.CompletionTokens += int64(r.Usage.CompletionTokens)
		m.CostUSD += float64(r.CostNanos) / 1e9
		u.ByModel[r.Model] = m
	}
	return nil
}

// Get implements core.UsageStore.
func (s *UsageStore) Get(_ context.Context, tenant, period string) (core.UsageSummary, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.data[tenant+"|"+period]
	if !ok {
		return core.UsageSummary{Tenant: tenant, Period: period, ByModel: map[string]core.ModelUsage{}}, nil
	}
	out := *u
	out.ByModel = make(map[string]core.ModelUsage, len(u.ByModel))
	for k, v := range u.ByModel {
		out.ByModel[k] = v
	}
	return out, nil
}

// ---------------------------------------------------------------- KV

type kvEntry struct {
	key     string
	val     []byte
	expires time.Time
}

// KV is a size-bounded LRU cache with per-entry TTL.
type KV struct {
	mu    sync.Mutex
	ll    *list.List
	items map[string]*list.Element
	max   int
	now   Clock
}

// NewKV creates a KV holding at most maxEntries.
func NewKV(maxEntries int, now Clock) *KV {
	if maxEntries <= 0 {
		maxEntries = 10_000
	}
	if now == nil {
		now = time.Now
	}
	return &KV{ll: list.New(), items: map[string]*list.Element{}, max: maxEntries, now: now}
}

// Get implements core.KV.
func (c *KV) Get(_ context.Context, key string) ([]byte, bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	el, ok := c.items[key]
	if !ok {
		return nil, false, nil
	}
	e := el.Value.(*kvEntry) //nolint:forcetypeassert // only *kvEntry is stored
	if !e.expires.IsZero() && c.now().After(e.expires) {
		c.ll.Remove(el)
		delete(c.items, key)
		return nil, false, nil
	}
	c.ll.MoveToFront(el)
	return e.val, true, nil
}

// Set implements core.KV.
func (c *KV) Set(_ context.Context, key string, val []byte, ttl time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.set(key, val, ttl)
	return nil
}

func (c *KV) set(key string, val []byte, ttl time.Duration) {
	var exp time.Time
	if ttl > 0 {
		exp = c.now().Add(ttl)
	}
	if el, ok := c.items[key]; ok {
		e := el.Value.(*kvEntry) //nolint:forcetypeassert // only *kvEntry is stored
		e.val, e.expires = val, exp
		c.ll.MoveToFront(el)
		return
	}
	c.items[key] = c.ll.PushFront(&kvEntry{key: key, val: val, expires: exp})
	for c.ll.Len() > c.max {
		last := c.ll.Back()
		c.ll.Remove(last)
		delete(c.items, last.Value.(*kvEntry).key) //nolint:forcetypeassert // only *kvEntry is stored
	}
}

// SetNX implements core.KV.
func (c *KV) SetNX(_ context.Context, key string, val []byte, ttl time.Duration) (bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[key]; ok {
		e := el.Value.(*kvEntry) //nolint:forcetypeassert // only *kvEntry is stored
		if e.expires.IsZero() || c.now().Before(e.expires) {
			return false, nil
		}
	}
	c.set(key, val, ttl)
	return true, nil
}

// Delete implements core.KV.
func (c *KV) Delete(_ context.Context, key string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[key]; ok {
		c.ll.Remove(el)
		delete(c.items, key)
	}
	return nil
}

// Len returns the number of entries (including expired, not yet evicted).
func (c *KV) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.ll.Len()
}
