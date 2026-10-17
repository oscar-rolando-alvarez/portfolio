package cache

import (
	"context"
	"fmt"
	"math"
	"math/rand/v2"
	"testing"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/adapters/memstore"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/adapters/provider/mock"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

type mockEmbedder struct{ calls int }

func (m *mockEmbedder) Embed(_ context.Context, texts []string) ([][]float32, error) {
	m.calls++
	out := make([][]float32, len(texts))
	for i, t := range texts {
		out[i] = mock.Vector(t, 256)
	}
	return out, nil
}

func req(msgs ...string) *core.ChatRequest {
	r := &core.ChatRequest{Model: "chat"}
	r.Messages = append(r.Messages, core.Message{Role: "system", Content: core.TextContent("You are helpful.")})
	for _, m := range msgs {
		r.Messages = append(r.Messages, core.Message{Role: "user", Content: core.TextContent(m)})
	}
	return r
}

func resp(text string) *core.ChatResponse {
	return &core.ChatResponse{ID: "x", Choices: []core.Choice{{Message: core.Message{Role: "assistant", Content: core.TextContent(text)}, FinishReason: "stop"}},
		Usage: &core.Usage{PromptTokens: 10, CompletionTokens: 5, TotalTokens: 15}}
}

func newCache(now func() time.Time) (*Cache, *mockEmbedder) {
	e := &mockEmbedder{}
	return New(memstore.NewKV(100, now), NewSemanticIndex(100, now), e), e
}

var settings = Settings{TTL: time.Minute, Semantic: true, SemanticThreshold: 0.92}

func TestExactThenSemanticHit(t *testing.T) {
	c, _ := newCache(nil)
	ctx := context.Background()
	l, err := c.Get(ctx, "acme", req("What is the capital of France?"), settings)
	if err != nil || l.Kind != Miss {
		t.Fatalf("kind=%s err=%v", l.Kind, err)
	}
	if err := c.Put(ctx, l, resp("Paris"), settings); err != nil {
		t.Fatal(err)
	}
	if l, _ := c.Get(ctx, "acme", req("What is the capital of France?"), settings); l.Kind != Exact {
		t.Fatalf("want exact, got %s", l.Kind)
	}
	l, _ = c.Get(ctx, "acme", req("what's the capital of france"), settings)
	if l.Kind != Semantic || l.Response.Choices[0].Message.Content.String() != "Paris" {
		t.Fatalf("want semantic hit, got %s (score %.3f)", l.Kind, l.Score)
	}
	if l, _ := c.Get(ctx, "acme", req("How do I bake sourdough bread?"), settings); l.Kind != Miss {
		t.Fatalf("unrelated prompt must miss, got %s", l.Kind)
	}
}

func TestTenantIsolation(t *testing.T) {
	c, _ := newCache(nil)
	ctx := context.Background()
	l, _ := c.Get(ctx, "acme", req("secret roadmap summary"), settings)
	_ = c.Put(ctx, l, resp("acme only"), settings)
	if l, _ := c.Get(ctx, "globex", req("secret roadmap summary"), settings); l.Kind != Miss {
		t.Fatalf("cross-tenant leak: %s", l.Kind)
	}
}

func TestConversationPrefixIsolation(t *testing.T) {
	c, _ := newCache(nil)
	ctx := context.Background()
	l, _ := c.Get(ctx, "acme", req("Tell me about Python"), settings)
	_ = c.Put(ctx, l, resp("snake"), settings)
	// Same last message but different earlier context must not hit.
	r := req("We are discussing programming languages.", "Tell me about Python")
	if l, _ := c.Get(ctx, "acme", r, settings); l.Kind != Miss {
		t.Fatalf("different conversation prefix must miss, got %s", l.Kind)
	}
}

func TestSemanticDisabled(t *testing.T) {
	c, e := newCache(nil)
	ctx := context.Background()
	s := settings
	s.Semantic = false
	l, _ := c.Get(ctx, "acme", req("What is the capital of France?"), s)
	_ = c.Put(ctx, l, resp("Paris"), s)
	if l, _ := c.Get(ctx, "acme", req("what's the capital of france"), s); l.Kind != Miss {
		t.Fatalf("semantic lookups must be off, got %s", l.Kind)
	}
	if e.calls != 0 {
		t.Fatalf("embedder called %d times with semantic disabled", e.calls)
	}
}

func TestTTLExpiry(t *testing.T) {
	now := time.Unix(0, 0)
	clock := func() time.Time { return now }
	c, _ := newCache(clock)
	ctx := context.Background()
	l, _ := c.Get(ctx, "acme", req("ttl test"), settings)
	_ = c.Put(ctx, l, resp("v"), settings)
	now = now.Add(2 * time.Minute)
	if l, _ := c.Get(ctx, "acme", req("ttl test"), settings); l.Kind != Miss {
		t.Fatalf("expired entry served: %s", l.Kind)
	}
}

func TestCacheable(t *testing.T) {
	r := req("x")
	if !Cacheable(r) {
		t.Fatal("plain request should be cacheable")
	}
	n := 2
	r.N = &n
	if Cacheable(r) {
		t.Fatal("n>1 must not be cacheable")
	}
}

func TestSemanticIndexRingBuffer(t *testing.T) {
	x := NewSemanticIndex(2, nil)
	for i := range 3 {
		x.Add("ns", mock.Vector(fmt.Sprint("doc", i), 32), fmt.Sprint("k", i), 0)
	}
	if x.Len("ns") != 2 {
		t.Fatalf("len=%d", x.Len("ns"))
	}
	if _, _, ok := x.Search("ns", mock.Vector("doc0", 32), 0.99); ok {
		t.Fatal("oldest entry should be evicted")
	}
	if k, _, ok := x.Search("ns", mock.Vector("doc2", 32), 0.99); !ok || k != "k2" {
		t.Fatalf("k=%s ok=%v", k, ok)
	}
}

func randomUnit(r *rand.Rand, dims int) []float32 {
	v := make([]float32, dims)
	for i := range v {
		v[i] = float32(r.NormFloat64())
	}
	var n float64
	for _, x := range v {
		n += float64(x) * float64(x)
	}
	inv := float32(1 / math.Sqrt(n))
	for i := range v {
		v[i] *= inv
	}
	return v
}

func benchmarkSearch(b *testing.B, n, dims int) {
	r := rand.New(rand.NewPCG(1, 2))
	x := NewSemanticIndex(n, nil)
	for i := range n {
		x.Add("ns", randomUnit(r, dims), fmt.Sprint(i), 0)
	}
	q := randomUnit(r, dims)
	b.ReportAllocs()
	for b.Loop() {
		x.Search("ns", q, 0.95)
	}
}

func BenchmarkSemanticSearch1kx256(b *testing.B)  { benchmarkSearch(b, 1_000, 256) }
func BenchmarkSemanticSearch10kx256(b *testing.B) { benchmarkSearch(b, 10_000, 256) }
func BenchmarkSemanticSearch1kx1536(b *testing.B) { benchmarkSearch(b, 1_000, 1536) }

func BenchmarkExactLookupHit(b *testing.B) {
	c, _ := newCache(nil)
	ctx := context.Background()
	r := req("What is the capital of France?")
	l, _ := c.Get(ctx, "acme", r, settings)
	_ = c.Put(ctx, l, resp("Paris"), settings)
	b.ReportAllocs()
	for b.Loop() {
		_, _ = c.Get(ctx, "acme", r, settings)
	}
}
