package openai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

func req() *core.ChatRequest {
	var r core.ChatRequest
	_ = json.Unmarshal([]byte(`{"model":"gpt-x","messages":[{"role":"user","content":"hi"}],"tools":[{"type":"function","function":{"name":"f"}}]}`), &r)
	return &r
}

func TestChat(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer sk-test" || r.Header.Get("X-Org") != "o" {
			http.Error(w, "bad request "+r.URL.Path, http.StatusBadRequest)
			return
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if _, ok := body["tools"]; !ok {
			http.Error(w, "tools not forwarded", http.StatusBadRequest)
			return
		}
		_, _ = io.WriteString(w, `{"id":"c1","object":"chat.completion","created":1,"model":"gpt-x","choices":[{"index":0,"message":{"role":"assistant","content":"hello"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}`)
	}))
	defer srv.Close()
	p := New("up", Options{BaseURL: srv.URL + "/v1/", APIKey: "sk-test", Headers: map[string]string{"X-Org": "o"}})
	resp, err := p.Chat(context.Background(), req())
	if err != nil {
		t.Fatal(err)
	}
	if resp.Choices[0].Message.Content.String() != "hello" || resp.Usage.TotalTokens != 4 {
		t.Fatalf("resp=%+v", resp)
	}
}

func TestAzureStyleHeader(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("api-key") != "k" || r.Header.Get("Authorization") != "" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = io.WriteString(w, `{"id":"c","choices":[]}`)
	}))
	defer srv.Close()
	p := New("az", Options{BaseURL: srv.URL, APIKey: "k", APIKeyHeader: "api-key"})
	if _, err := p.Chat(context.Background(), req()); err != nil {
		t.Fatal(err)
	}
}

func TestErrorMapping(t *testing.T) {
	cases := []struct {
		status    int
		retryable bool
		outStatus int
	}{
		{http.StatusTooManyRequests, true, http.StatusTooManyRequests},
		{http.StatusInternalServerError, true, http.StatusBadGateway},
		{http.StatusServiceUnavailable, true, http.StatusBadGateway},
		{http.StatusBadRequest, false, http.StatusBadRequest},
		{http.StatusUnauthorized, false, http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(fmt.Sprint(tc.status), func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Retry-After", "2")
				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, `{"error":{"message":"nope"}}`)
			}))
			defer srv.Close()
			_, err := New("up", Options{BaseURL: srv.URL}).Chat(context.Background(), req())
			var ge *core.Error
			if !errors.As(err, &ge) {
				t.Fatalf("err=%v", err)
			}
			if ge.Retryable != tc.retryable || ge.Status != tc.outStatus {
				t.Fatalf("got retryable=%v status=%d", ge.Retryable, ge.Status)
			}
			if tc.status == http.StatusTooManyRequests && ge.RetryAfter != 2*time.Second {
				t.Fatalf("retry-after=%v", ge.RetryAfter)
			}
		})
	}
}

func TestConnectionErrorRetryable(t *testing.T) {
	_, err := New("up", Options{BaseURL: "http://127.0.0.1:1"}).Chat(context.Background(), req())
	if !core.IsRetryable(err) {
		t.Fatalf("connection errors must be retryable: %v", err)
	}
}

func TestStream(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body core.ChatRequest
		_ = json.NewDecoder(r.Body).Decode(&body)
		if !body.Stream || body.StreamOptions == nil || !body.StreamOptions.IncludeUsage {
			http.Error(w, "usage must be requested", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fl := w.(http.Flusher)
		for _, line := range []string{
			`: keep-alive`,
			`data: {"id":"s","choices":[{"index":0,"delta":{"role":"assistant"}}]}`,
			`data: {"id":"s","choices":[{"index":0,"delta":{"content":"Hel"}}]}`,
			`data: {"id":"s","choices":[{"index":0,"delta":{"content":"lo"},"finish_reason":"stop"}]}`,
			`data: {"id":"s","choices":[],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}`,
			`data: [DONE]`,
		} {
			_, _ = io.WriteString(w, line+"\n\n")
			fl.Flush()
		}
	}))
	defer srv.Close()
	s, err := New("up", Options{BaseURL: srv.URL}).ChatStream(context.Background(), req())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = s.Close() }()
	text, chunks := "", 0
	var usage *core.Usage
	for {
		c, err := s.Recv()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		chunks++
		if c.Usage != nil {
			usage = c.Usage
		}
		for _, ch := range c.Choices {
			text += ch.Delta.Content
		}
	}
	if text != "Hello" || chunks != 4 || usage == nil || usage.TotalTokens != 4 {
		t.Fatalf("text=%q chunks=%d usage=%v", text, chunks, usage)
	}
}

func TestEmbed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"object":"list","data":[{"object":"embedding","index":0,"embedding":[0.1,0.2]}],"model":"e","usage":{"prompt_tokens":1,"total_tokens":1}}`)
	}))
	defer srv.Close()
	out, err := New("up", Options{BaseURL: srv.URL}).Embed(context.Background(), &core.EmbeddingRequest{Model: "e", Input: json.RawMessage(`"x"`)})
	if err != nil || len(out.Data) != 1 || len(out.Data[0].Embedding) != 2 {
		t.Fatalf("out=%+v err=%v", out, err)
	}
}
