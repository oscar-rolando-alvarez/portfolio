// Package redisstore implements the state ports on Redis so that rate
// limits, budgets and the exact cache are shared across gateway replicas.
package redisstore

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

// Store bundles the Redis-backed adapters.
type Store struct {
	rdb    redis.UniversalClient
	prefix string
}

// New connects to Redis using a redis:// or rediss:// URL.
func New(ctx context.Context, url, prefix string) (*Store, error) {
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	opts.DialTimeout = 2 * time.Second
	opts.ReadTimeout = 500 * time.Millisecond
	opts.WriteTimeout = 500 * time.Millisecond
	rdb := redis.NewClient(opts)
	pctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if err := rdb.Ping(pctx).Err(); err != nil {
		_ = rdb.Close()
		return nil, fmt.Errorf("redis ping: %w", err)
	}
	return &Store{rdb: rdb, prefix: prefix}, nil
}

// NewFromClient wraps an existing client (tests).
func NewFromClient(rdb redis.UniversalClient, prefix string) *Store {
	return &Store{rdb: rdb, prefix: prefix}
}

// Client exposes the underlying client (instrumentation, tests).
func (s *Store) Client() redis.UniversalClient { return s.rdb }

// Close closes the connection pool.
func (s *Store) Close() error { return s.rdb.Close() }

// Ping implements core.Pinger.
func (s *Store) Ping(ctx context.Context) error { return s.rdb.Ping(ctx).Err() }

// ---------------------------------------------------------------- limiter

// tokenBucket atomically refills and takes from a bucket. Time comes from the
// Redis server so replicas with skewed clocks agree.
var tokenBucket = redis.NewScript(`
local key   = KEYS[1]
local n     = tonumber(ARGV[1])
local rate  = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])
local force = ARGV[4] == "1"
local t     = redis.call('TIME')
local now   = tonumber(t[1]) + tonumber(t[2]) / 1000000
local data  = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts     = tonumber(data[2])
if tokens == nil then
  tokens = burst
  ts = now
end
local elapsed = now - ts
if elapsed > 0 then
  tokens = math.min(burst, tokens + elapsed * rate)
end
local allowed = 0
local retry = 0
if tokens >= n or force then
  tokens = tokens - n
  allowed = 1
else
  retry = (n - tokens) / rate
end
redis.call('HSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, math.ceil(burst / rate * 1000) + 60000)
return {allowed, tostring(tokens), tostring(retry)}
`)

// RateLimiter is a Redis token bucket limiter.
type RateLimiter struct{ s *Store }

// RateLimiter returns the limiter adapter.
func (s *Store) RateLimiter() *RateLimiter { return &RateLimiter{s: s} }

// Take implements core.RateLimiter.
func (l *RateLimiter) Take(ctx context.Context, key string, n, rate, burst float64, force bool) (core.Decision, error) {
	f := "0"
	if force {
		f = "1"
	}
	res, err := tokenBucket.Run(ctx, l.s.rdb, []string{l.s.prefix + "rl:" + key},
		strconv.FormatFloat(n, 'f', -1, 64), strconv.FormatFloat(rate, 'f', -1, 64),
		strconv.FormatFloat(burst, 'f', -1, 64), f).Slice()
	if err != nil {
		return core.Decision{}, fmt.Errorf("rate limit script: %w", err)
	}
	if len(res) != 3 {
		return core.Decision{}, errors.New("rate limit script: unexpected reply")
	}
	allowed, _ := res[0].(int64)
	remaining, _ := strconv.ParseFloat(fmt.Sprint(res[1]), 64)
	retry, _ := strconv.ParseFloat(fmt.Sprint(res[2]), 64)
	return core.Decision{
		Allowed:    allowed == 1,
		Remaining:  remaining,
		RetryAfter: time.Duration(retry * float64(time.Second)),
	}, nil
}

// ---------------------------------------------------------------- usage

// UsageStore keeps monthly counters in one Redis hash per tenant and month.
type UsageStore struct{ s *Store }

// UsageStore returns the usage adapter.
func (s *Store) UsageStore() *UsageStore { return &UsageStore{s: s} }

const usageRetention = 400 * 24 * time.Hour // keep ~13 months for reports

func (u *UsageStore) key(tenant, period string) string {
	return u.s.prefix + "usage:" + tenant + ":" + period
}

// Record implements core.UsageStore.
func (u *UsageStore) Record(ctx context.Context, r core.UsageRecord) error {
	k := u.key(r.Tenant, r.Period)
	pipe := u.s.rdb.TxPipeline()
	pipe.HIncrBy(ctx, k, "requests", 1)
	if r.CacheHit {
		pipe.HIncrBy(ctx, k, "cache_hits", 1)
	}
	pipe.HIncrBy(ctx, k, "prompt_tokens", int64(r.Usage.PromptTokens))
	pipe.HIncrBy(ctx, k, "completion_tokens", int64(r.Usage.CompletionTokens))
	pipe.HIncrBy(ctx, k, "cost_nanos", r.CostNanos)
	if r.Model != "" {
		m := "m|" + r.Model + "|"
		pipe.HIncrBy(ctx, k, m+"requests", 1)
		pipe.HIncrBy(ctx, k, m+"prompt_tokens", int64(r.Usage.PromptTokens))
		pipe.HIncrBy(ctx, k, m+"completion_tokens", int64(r.Usage.CompletionTokens))
		pipe.HIncrBy(ctx, k, m+"cost_nanos", r.CostNanos)
	}
	pipe.Expire(ctx, k, usageRetention)
	_, err := pipe.Exec(ctx)
	return err
}

// Get implements core.UsageStore.
func (u *UsageStore) Get(ctx context.Context, tenant, period string) (core.UsageSummary, error) {
	out := core.UsageSummary{Tenant: tenant, Period: period, ByModel: map[string]core.ModelUsage{}}
	h, err := u.s.rdb.HGetAll(ctx, u.key(tenant, period)).Result()
	if err != nil {
		return out, err
	}
	costs := map[string]int64{}
	for f, v := range h {
		n, _ := strconv.ParseInt(v, 10, 64)
		if model, field, ok := parseModelField(f); ok {
			m := out.ByModel[model]
			switch field {
			case "requests":
				m.Requests = n
			case "prompt_tokens":
				m.PromptTokens = n
			case "completion_tokens":
				m.CompletionTokens = n
			case "cost_nanos":
				costs[model] = n
				m.CostUSD = float64(n) / 1e9
			}
			out.ByModel[model] = m
			continue
		}
		switch f {
		case "requests":
			out.Requests = n
		case "cache_hits":
			out.CacheHits = n
		case "prompt_tokens":
			out.PromptTokens = n
		case "completion_tokens":
			out.CompletionTokens = n
		case "cost_nanos":
			out.CostNanos = n
		}
	}
	out.TotalTokens = out.PromptTokens + out.CompletionTokens
	out.CostUSD = float64(out.CostNanos) / 1e9
	return out, nil
}

func parseModelField(f string) (model, field string, ok bool) {
	if !strings.HasPrefix(f, "m|") {
		return "", "", false
	}
	rest := f[2:]
	i := strings.LastIndexByte(rest, '|')
	if i < 0 {
		return "", "", false
	}
	return rest[:i], rest[i+1:], true
}

// ---------------------------------------------------------------- KV

// KV is a Redis-backed byte cache.
type KV struct{ s *Store }

// KV returns the KV adapter.
func (s *Store) KV() *KV { return &KV{s: s} }

// Get implements core.KV.
func (c *KV) Get(ctx context.Context, key string) ([]byte, bool, error) {
	b, err := c.s.rdb.Get(ctx, c.s.prefix+key).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return b, true, nil
}

// Set implements core.KV.
func (c *KV) Set(ctx context.Context, key string, val []byte, ttl time.Duration) error {
	return c.s.rdb.Set(ctx, c.s.prefix+key, val, ttl).Err()
}

// SetNX implements core.KV.
func (c *KV) SetNX(ctx context.Context, key string, val []byte, ttl time.Duration) (bool, error) {
	res, err := c.s.rdb.SetArgs(ctx, c.s.prefix+key, val, redis.SetArgs{Mode: "NX", TTL: ttl}).Result()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return res == "OK", nil
}

// Delete implements core.KV.
func (c *KV) Delete(ctx context.Context, key string) error {
	return c.s.rdb.Del(ctx, c.s.prefix+key).Err()
}
