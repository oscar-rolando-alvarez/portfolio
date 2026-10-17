// Package openai implements core.Provider for any OpenAI-compatible HTTP API
// (OpenAI, Azure OpenAI v1 endpoint, vLLM, Ollama, LiteLLM, TGI, ...).
package openai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

// Options configures the adapter.
type Options struct {
	BaseURL      string // e.g. https://api.openai.com/v1
	APIKey       string
	APIKeyHeader string // "Authorization" (Bearer) or a raw header such as "api-key"
	Headers      map[string]string
	Client       *http.Client
}

// Provider talks to an OpenAI-compatible endpoint.
type Provider struct {
	name string
	opts Options
}

// maxErrorBody bounds how much of an upstream error body is read.
const maxErrorBody = 8 << 10

// New creates the adapter. The http.Client should carry timeouts and tracing.
func New(name string, opts Options) *Provider {
	if opts.Client == nil {
		opts.Client = &http.Client{Timeout: 120 * time.Second}
	}
	if opts.APIKeyHeader == "" {
		opts.APIKeyHeader = "Authorization"
	}
	opts.BaseURL = strings.TrimRight(opts.BaseURL, "/")
	return &Provider{name: name, opts: opts}
}

// Name implements core.Provider.
func (p *Provider) Name() string { return p.name }

func (p *Provider) newRequest(ctx context.Context, path string, body any, stream bool) (*http.Request, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("encode request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.opts.BaseURL+path, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if stream {
		req.Header.Set("Accept", "text/event-stream")
	} else {
		req.Header.Set("Accept", "application/json")
	}
	if p.opts.APIKey != "" {
		if strings.EqualFold(p.opts.APIKeyHeader, "Authorization") {
			req.Header.Set("Authorization", "Bearer "+p.opts.APIKey)
		} else {
			req.Header.Set(p.opts.APIKeyHeader, p.opts.APIKey)
		}
	}
	for k, v := range p.opts.Headers {
		req.Header.Set(k, v)
	}
	return req, nil
}

func (p *Provider) do(req *http.Request) (*http.Response, error) {
	resp, err := p.opts.Client.Do(req)
	if err != nil {
		if ctxErr := req.Context().Err(); ctxErr != nil {
			return nil, ctxErr
		}
		return nil, &core.Error{Status: http.StatusBadGateway, Type: "api_error", Code: core.CodeUpstreamError,
			Message: "upstream unreachable", Retryable: true, Cause: err}
	}
	if resp.StatusCode/100 != 2 {
		defer func() { _ = resp.Body.Close() }()
		body, _ := io.ReadAll(io.LimitReader(resp.Body, maxErrorBody))
		return nil, core.UpstreamError(resp.StatusCode, upstreamMessage(body), retryAfter(resp.Header))
	}
	return resp, nil
}

func upstreamMessage(body []byte) string {
	var env struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &env) == nil && env.Error.Message != "" {
		return truncate(env.Error.Message, 300)
	}
	return truncate(strings.TrimSpace(string(body)), 300)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func retryAfter(h http.Header) time.Duration {
	v := h.Get("Retry-After")
	if v == "" {
		return 0
	}
	if secs, err := strconv.Atoi(v); err == nil {
		return time.Duration(secs) * time.Second
	}
	if t, err := http.ParseTime(v); err == nil {
		return time.Until(t)
	}
	return 0
}

// Chat implements core.Provider.
func (p *Provider) Chat(ctx context.Context, in *core.ChatRequest) (*core.ChatResponse, error) {
	r := *in
	r.Stream = false
	r.StreamOptions = nil
	req, err := p.newRequest(ctx, "/chat/completions", r, false)
	if err != nil {
		return nil, err
	}
	resp, err := p.do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	var out core.ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, &core.Error{Status: http.StatusBadGateway, Type: "api_error", Code: core.CodeUpstreamError,
			Message: "invalid upstream response", Retryable: true, Cause: err}
	}
	return &out, nil
}

// ChatStream implements core.Provider. Usage reporting is always requested
// upstream so the gateway can account tokens even if the client did not ask.
func (p *Provider) ChatStream(ctx context.Context, in *core.ChatRequest) (core.ChatStream, error) {
	r := *in
	r.Stream = true
	r.StreamOptions = &core.StreamOptions{IncludeUsage: true}
	req, err := p.newRequest(ctx, "/chat/completions", r, true)
	if err != nil {
		return nil, err
	}
	resp, err := p.do(req) //nolint:bodyclose // ownership moves to sseStream, closed by Close
	if err != nil {
		return nil, err
	}
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 0, 64<<10), 1<<20)
	return &sseStream{body: resp.Body, sc: sc}, nil
}

type sseStream struct {
	body io.ReadCloser
	sc   *bufio.Scanner
	done bool
}

func (s *sseStream) Recv() (*core.ChatChunk, error) {
	if s.done {
		return nil, io.EOF
	}
	for s.sc.Scan() {
		line := s.sc.Bytes()
		if len(line) == 0 || line[0] == ':' {
			continue
		}
		data, ok := bytes.CutPrefix(line, []byte("data:"))
		if !ok {
			continue // event:, id:, retry: fields are not used by this API
		}
		data = bytes.TrimSpace(data)
		if bytes.Equal(data, []byte("[DONE]")) {
			s.done = true
			return nil, io.EOF
		}
		var c core.ChatChunk
		if err := json.Unmarshal(data, &c); err != nil {
			return nil, fmt.Errorf("decode stream chunk: %w", err)
		}
		return &c, nil
	}
	if err := s.sc.Err(); err != nil {
		return nil, err
	}
	s.done = true
	return nil, io.EOF
}

func (s *sseStream) Close() error { return s.body.Close() }

// Embed implements core.Provider.
func (p *Provider) Embed(ctx context.Context, in *core.EmbeddingRequest) (*core.EmbeddingResponse, error) {
	req, err := p.newRequest(ctx, "/embeddings", in, false)
	if err != nil {
		return nil, err
	}
	resp, err := p.do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	var out core.EmbeddingResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, &core.Error{Status: http.StatusBadGateway, Type: "api_error", Code: core.CodeUpstreamError,
			Message: "invalid upstream response", Retryable: true, Cause: err}
	}
	if len(out.Data) == 0 {
		return nil, errors.New("upstream returned no embeddings")
	}
	return &out, nil
}
