package core

import (
	"context"
	"time"
)

// Provider is the outbound port for an LLM backend. Implementations must
// honour context cancellation and must be safe for concurrent use.
type Provider interface {
	Name() string
	Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error)
	// ChatStream opens a streaming completion. Recv returns io.EOF at the end.
	ChatStream(ctx context.Context, req *ChatRequest) (ChatStream, error)
	Embed(ctx context.Context, req *EmbeddingRequest) (*EmbeddingResponse, error)
}

// ChatStream is an open server-sent-events stream from a provider.
type ChatStream interface {
	Recv() (*ChatChunk, error)
	Close() error
}

// Decision is the outcome of a rate limiter check.
type Decision struct {
	Allowed    bool
	Remaining  float64
	RetryAfter time.Duration
}

// RateLimiter implements token buckets keyed by an arbitrary string.
type RateLimiter interface {
	// Take removes n tokens from the bucket identified by key, refilled at
	// ratePerSec up to burst. When force is true the tokens are always taken,
	// possibly driving the bucket negative (used to reconcile actual usage).
	Take(ctx context.Context, key string, n, ratePerSec, burst float64, force bool) (Decision, error)
}

// UsageRecord is one accounted request.
type UsageRecord struct {
	Tenant    string
	Period    string // YYYY-MM
	Model     string
	Usage     Usage
	CostNanos int64 // cost in nano-USD (1e-9 USD) to keep integer arithmetic
	CacheHit  bool
}

// ModelUsage aggregates usage for one model.
type ModelUsage struct {
	Requests         int64   `json:"requests"`
	PromptTokens     int64   `json:"prompt_tokens"`
	CompletionTokens int64   `json:"completion_tokens"`
	CostUSD          float64 `json:"cost_usd"`
}

// UsageSummary is the monthly usage of a tenant.
type UsageSummary struct {
	Tenant           string                `json:"tenant"`
	Period           string                `json:"period"`
	Requests         int64                 `json:"requests"`
	CacheHits        int64                 `json:"cache_hits"`
	PromptTokens     int64                 `json:"prompt_tokens"`
	CompletionTokens int64                 `json:"completion_tokens"`
	TotalTokens      int64                 `json:"total_tokens"`
	CostNanos        int64                 `json:"-"`
	CostUSD          float64               `json:"cost_usd"`
	ByModel          map[string]ModelUsage `json:"by_model"`
}

// UsageStore persists monthly per-tenant usage for budgets and reports.
type UsageStore interface {
	Record(ctx context.Context, rec UsageRecord) error
	Get(ctx context.Context, tenant, period string) (UsageSummary, error)
}

// KV is a byte cache with TTL used by the exact response cache and
// idempotency replay.
type KV interface {
	Get(ctx context.Context, key string) ([]byte, bool, error)
	Set(ctx context.Context, key string, val []byte, ttl time.Duration) error
	// SetNX stores val only if key is absent; returns true when stored.
	SetNX(ctx context.Context, key string, val []byte, ttl time.Duration) (bool, error)
	Delete(ctx context.Context, key string) error
}

// Embedder turns texts into L2-normalised vectors.
type Embedder interface {
	Embed(ctx context.Context, texts []string) ([][]float32, error)
}

// Pinger is implemented by adapters that have a readiness dependency.
type Pinger interface {
	Ping(ctx context.Context) error
}
