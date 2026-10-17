package mock

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

func chatReq(text string) *core.ChatRequest {
	return &core.ChatRequest{Model: "m", Messages: []core.Message{{Role: "user", Content: core.TextContent(text)}}}
}

func TestChatDeterministicEcho(t *testing.T) {
	p := New("mock", Options{})
	a, err := p.Chat(context.Background(), chatReq("hello world"))
	if err != nil {
		t.Fatal(err)
	}
	b, _ := p.Chat(context.Background(), chatReq("hello world"))
	if a.ID != b.ID || a.Choices[0].Message.Content.String() != b.Choices[0].Message.Content.String() {
		t.Fatal("mock must be deterministic")
	}
	if !strings.Contains(a.Choices[0].Message.Content.String(), "You said: hello world") {
		t.Fatalf("content=%q", a.Choices[0].Message.Content.String())
	}
	if a.Usage == nil || a.Usage.TotalTokens != a.Usage.PromptTokens+a.Usage.CompletionTokens {
		t.Fatalf("usage=%+v", a.Usage)
	}
}

func TestDirectives(t *testing.T) {
	p := New("mock", Options{})
	_, err := p.Chat(context.Background(), chatReq("x [[mock:error=429]]"))
	var ge *core.Error
	if !errors.As(err, &ge) || ge.Status != http.StatusTooManyRequests || !ge.Retryable {
		t.Fatalf("err=%v", err)
	}
	resp, err := p.Chat(context.Background(), chatReq("[[mock:say=literal answer]]"))
	if err != nil || resp.Choices[0].Message.Content.String() != "literal answer" {
		t.Fatalf("resp=%v err=%v", resp, err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if _, err := p.Chat(ctx, chatReq("[[mock:sleep=1s]]")); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("sleep must honour context: %v", err)
	}
}

func TestFailStatus(t *testing.T) {
	p := New("down", Options{FailStatus: 503})
	if _, err := p.Chat(context.Background(), chatReq("x")); err == nil {
		t.Fatal("expected failure")
	}
}

func TestStream(t *testing.T) {
	p := New("mock", Options{})
	req := chatReq("one two three")
	req.StreamOptions = &core.StreamOptions{IncludeUsage: true}
	s, err := p.ChatStream(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = s.Close() }()
	var sb strings.Builder
	var usage *core.Usage
	var finish string
	for {
		c, err := s.Recv()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		if c.Usage != nil {
			usage = c.Usage
		}
		for _, ch := range c.Choices {
			sb.WriteString(ch.Delta.Content)
			if ch.FinishReason != nil {
				finish = *ch.FinishReason
			}
		}
	}
	full, _ := p.Chat(context.Background(), chatReq("one two three"))
	if sb.String() != full.Choices[0].Message.Content.String() || finish != "stop" || usage == nil {
		t.Fatalf("stream=%q finish=%q usage=%v", sb.String(), finish, usage)
	}
}

func TestEmbeddingsSimilarity(t *testing.T) {
	p := New("mock", Options{EmbeddingDims: 256})
	in, _ := json.Marshal([]string{
		"What is the capital of France?",
		"what's the capital of france",
		"How do I bake sourdough bread?",
	})
	resp, err := p.Embed(context.Background(), &core.EmbeddingRequest{Model: "e", Input: in})
	if err != nil {
		t.Fatal(err)
	}
	dot := func(a, b []float32) float32 {
		var s float32
		for i := range a {
			s += a[i] * b[i]
		}
		return s
	}
	v := resp.Data
	if s := dot(v[0].Embedding, v[1].Embedding); s < 0.99 {
		t.Fatalf("paraphrase similarity %.3f", s)
	}
	if s := dot(v[0].Embedding, v[2].Embedding); s > 0.3 {
		t.Fatalf("unrelated similarity %.3f", s)
	}
	if len(v[0].Embedding) != 256 {
		t.Fatalf("dims=%d", len(v[0].Embedding))
	}
}
