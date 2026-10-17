// Package cache implements the two-tier response cache: an exact cache keyed
// by a canonical hash of the request, and a semantic cache that matches the
// last user message by embedding cosine similarity. Both are namespaced per
// tenant (and per model alias + conversation prefix) so tenants never see each
// other's data.
package cache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

// Hit kinds.
const (
	Miss     = "miss"
	Exact    = "exact"
	Semantic = "semantic"
	Bypass   = "bypass"
)

// Settings are the per-tenant cache settings for one lookup.
type Settings struct {
	TTL               time.Duration
	Semantic          bool
	SemanticThreshold float32
}

// Cache combines the exact KV cache and the semantic index.
type Cache struct {
	kv    core.KV
	index *SemanticIndex
	embed core.Embedder
}

// New creates a cache. embed and index may be nil to disable semantic lookups.
func New(kv core.KV, index *SemanticIndex, embed core.Embedder) *Cache {
	return &Cache{kv: kv, index: index, embed: embed}
}

// Lookup is the result of a cache lookup. Vector is kept so a subsequent
// Store does not need to embed the prompt again.
type Lookup struct {
	Kind     string
	Response *core.ChatResponse
	Score    float32
	key      string
	ns       string
	vector   []float32
	semText  string
}

// Cacheable reports whether a request may be served from / stored in cache.
// Tool calls and n>1 are excluded because their outputs are not reusable.
func Cacheable(req *core.ChatRequest) bool {
	if req.HasTools() {
		return false
	}
	if req.N != nil && *req.N > 1 {
		return false
	}
	return true
}

type canonical struct {
	Alias       string                     `json:"a"`
	Messages    []core.Message             `json:"m"`
	Temperature *float64                   `json:"t,omitempty"`
	TopP        *float64                   `json:"p,omitempty"`
	MaxTokens   int                        `json:"x,omitempty"`
	Stop        json.RawMessage            `json:"s,omitempty"`
	Extra       map[string]json.RawMessage `json:"e,omitempty"`
}

func hashJSON(v any) string {
	b, _ := json.Marshal(v) // canonical struct of JSON-safe types; cannot fail
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func keys(tenant string, req *core.ChatRequest) (exactKey, ns, semText string) {
	c := canonical{
		Alias: req.Model, Messages: req.Messages, Temperature: req.Temperature, TopP: req.TopP,
		MaxTokens: req.MaxOutputTokens(0), Stop: req.Stop, Extra: req.Extra,
	}
	exactKey = "cache:x:" + tenant + ":" + hashJSON(c)

	// The semantic namespace pins everything except the final user message,
	// so only the last turn is compared by meaning.
	last := len(c.Messages) - 1
	if last >= 0 && c.Messages[last].Role == "user" {
		semText = c.Messages[last].Content.String()
		c.Messages = c.Messages[:last]
	}
	ns = tenant + ":" + hashJSON(c)
	return exactKey, ns, semText
}

// Prepare computes the cache keys without a lookup (explicit bypass: the
// fresh answer still refreshes the cache).
func (c *Cache) Prepare(tenant string, req *core.ChatRequest) Lookup {
	exactKey, ns, semText := keys(tenant, req)
	return Lookup{Kind: Bypass, key: exactKey, ns: ns, semText: semText}
}

// Get looks the request up in the exact cache, then the semantic index.
func (c *Cache) Get(ctx context.Context, tenant string, req *core.ChatRequest, s Settings) (Lookup, error) {
	exactKey, ns, semText := keys(tenant, req)
	l := Lookup{Kind: Miss, key: exactKey, ns: ns, semText: semText}
	if resp, ok, err := c.load(ctx, exactKey); err != nil {
		return l, err
	} else if ok {
		l.Kind, l.Response, l.Score = Exact, resp, 1
		return l, nil
	}
	if !s.Semantic || c.index == nil || c.embed == nil || semText == "" {
		return l, nil
	}
	vecs, err := c.embed.Embed(ctx, []string{semText})
	if err != nil || len(vecs) != 1 {
		return l, err
	}
	l.vector = vecs[0]
	key, score, ok := c.index.Search(ns, l.vector, s.SemanticThreshold)
	if !ok {
		return l, nil
	}
	resp, ok, err := c.load(ctx, key)
	if err != nil || !ok {
		return l, err
	}
	l.Kind, l.Response, l.Score = Semantic, resp, score
	return l, nil
}

func (c *Cache) load(ctx context.Context, key string) (*core.ChatResponse, bool, error) {
	b, ok, err := c.kv.Get(ctx, key)
	if err != nil || !ok {
		return nil, false, err
	}
	var resp core.ChatResponse
	if err := json.Unmarshal(b, &resp); err != nil {
		return nil, false, nil //nolint:nilerr // corrupt entries are treated as misses
	}
	return &resp, true, nil
}

// Put stores a response under the lookup's exact key and indexes its vector.
func (c *Cache) Put(ctx context.Context, l Lookup, resp *core.ChatResponse, s Settings) error {
	if l.key == "" {
		return nil
	}
	b, err := json.Marshal(resp)
	if err != nil {
		return err
	}
	if err := c.kv.Set(ctx, l.key, b, s.TTL); err != nil {
		return err
	}
	if !s.Semantic || c.index == nil || c.embed == nil || l.semText == "" {
		return nil
	}
	vec := l.vector
	if vec == nil {
		vecs, err := c.embed.Embed(ctx, []string{l.semText})
		if err != nil || len(vecs) != 1 {
			return err
		}
		vec = vecs[0]
	}
	c.index.Add(l.ns, vec, l.key, s.TTL)
	return nil
}
