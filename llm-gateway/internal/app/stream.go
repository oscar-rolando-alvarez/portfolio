package app

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"

	"go.opentelemetry.io/otel/trace"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/governance"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/routing"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/tokens"
)

// primed is an upstream stream whose first chunk has already been read.
// Reading it inside the routed call means connection errors and upstream
// failures that surface only on the first read still trigger fallback;
// once the first byte is forwarded to the client the target is committed.
type primed struct {
	s     core.ChatStream
	first *core.ChatChunk
	span  trace.Span
}

// ChatStream serves a streaming chat completion through w.
func (g *Gateway) ChatStream(ctx context.Context, p governance.Principal, in *core.ChatRequest, meta Meta, w StreamWriter) (err error) {
	g.Metrics.InFlight.Inc()
	defer g.Metrics.InFlight.Dec()

	var x *exchange
	defer func() {
		if x != nil {
			g.finish(ctx, x, err)
		}
	}()
	x, err = g.prepare(ctx, p, in, meta)
	if err != nil {
		return err
	}
	includeUsage := in.StreamOptions != nil && in.StreamOptions.IncludeUsage

	if x.lookup.Response != nil {
		resp := x.lookup.Response
		resp.ID = "chatcmpl-cache-" + shortHash(meta.RequestID)
		resp.Created = g.Now().Unix()
		g.accountCacheHit(ctx, x, resp)
		return replay(w, x.info, resp, includeUsage)
	}

	// Response redaction cannot be applied safely to partial tokens (an
	// e-mail address may span chunks), so for tenants that require it the
	// upstream answer is buffered, redacted, then streamed. This trades
	// time-to-first-token for a guarantee that no PII leaves the gateway.
	if p.Tenant.Guardrails.ResponseRedaction {
		resp, err := g.callUpstream(ctx, x)
		if err != nil {
			return err
		}
		g.redactResponse(x, resp)
		g.storeCache(ctx, x, resp)
		return replay(w, x.info, resp, includeUsage)
	}

	plan := g.Registry.Plan(x.route, x.estPrompt, x.estOutput)
	res, err := routing.Execute(ctx, g.Registry, x.route, plan, routing.Options{KeepAlive: true},
		func(ctx context.Context, t routing.Target) (*primed, error) {
			req := *x.req
			req.Model = t.Model
			ctx, span := g.startProviderSpan(ctx, "chat", t, &req)
			s, err := t.Provider.ChatStream(ctx, &req)
			if err != nil {
				endProviderSpan(span, nil, err)
				return nil, err
			}
			first, err := s.Recv()
			if err != nil {
				_ = s.Close()
				if errors.Is(err, io.EOF) {
					err = &core.Error{Status: http.StatusBadGateway, Type: "api_error", Code: core.CodeUpstreamError,
						Message: "upstream closed the stream without data", Retryable: true}
				} else if ctx.Err() == nil && !isGatewayError(err) {
					err = &core.Error{Status: http.StatusBadGateway, Type: "api_error", Code: core.CodeUpstreamError,
						Message: "upstream stream error", Retryable: true, Cause: err}
				}
				endProviderSpan(span, nil, err)
				return nil, err
			}
			return &primed{s: s, first: first, span: span}, nil
		})
	g.recordAttempts(x, res.Attempts, res.Fallbacks(), res.Hedged)
	if err != nil {
		return err
	}
	defer res.Release()
	ps := res.Value
	defer func() { _ = ps.s.Close() }()

	t := res.Target
	g.Metrics.TTFT.WithLabelValues(x.req.Model, t.Provider.Name()).Observe(g.Now().Sub(x.start).Seconds())
	x.info.Provider, x.info.ProviderModel = t.Provider.Name(), t.Model
	if err := w.Begin(x.info); err != nil {
		endProviderSpan(ps.span, nil, err)
		return err
	}

	var (
		content strings.Builder
		usage   *core.Usage
		finish  string
		id      string
		created int64
	)
	chunk := ps.first
	var streamErr error
	for {
		if chunk.Usage != nil {
			u := *chunk.Usage
			usage = &u
		}
		if id == "" {
			id, created = chunk.ID, chunk.Created
		}
		for _, c := range chunk.Choices {
			if c.Index == 0 {
				content.WriteString(c.Delta.Content)
				if c.FinishReason != nil {
					finish = *c.FinishReason
				}
			}
		}
		chunk.Model = x.req.Model
		usageOnly := len(chunk.Choices) == 0 && chunk.Usage != nil
		if !includeUsage {
			chunk.Usage = nil
		}
		if !usageOnly || includeUsage {
			if err := w.Chunk(chunk); err != nil {
				streamErr = ErrStreamAborted
				break
			}
		}
		next, err := ps.s.Recv()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			streamErr = err
			break
		}
		chunk = next
	}

	// Account whatever was produced, even for aborted streams: the
	// upstream has billed for it.
	u := core.Usage{}
	if usage != nil {
		u = *usage
	} else {
		u = core.Usage{PromptTokens: x.estPrompt, CompletionTokens: tokens.EstimateText(content.String())}
		u.TotalTokens = u.PromptTokens + u.CompletionTokens
	}
	g.accountUpstream(ctx, x, t, u)
	assembled := &core.ChatResponse{
		ID: id, Object: "chat.completion", Created: created, Model: x.req.Model,
		Choices: []core.Choice{{Index: 0, Message: core.Message{Role: "assistant", Content: core.TextContent(content.String())}, FinishReason: finish}},
		Usage:   &u,
	}
	if streamErr != nil {
		endProviderSpan(ps.span, nil, streamErr)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return streamErr
	}
	endProviderSpan(ps.span, assembled, nil)
	if finish != "" {
		g.storeCache(ctx, x, assembled)
	}
	return nil
}

func isGatewayError(err error) bool {
	var ge *core.Error
	return errors.As(err, &ge)
}

func (g *Gateway) storeCache(ctx context.Context, x *exchange, resp *core.ChatResponse) {
	if !x.cacheable || x.lookup.Kind == "" || g.Cache == nil {
		return
	}
	if err := g.Cache.Put(context.WithoutCancel(ctx), x.lookup, resp, x.cacheSet); err != nil {
		g.Logger.WarnContext(ctx, "cache store failed", "err", err)
	}
}

// replay streams a complete response as SSE chunks (cache hits and
// buffered/redacted responses).
func replay(w StreamWriter, info Info, resp *core.ChatResponse, includeUsage bool) error {
	if err := w.Begin(info); err != nil {
		return err
	}
	mk := func(choices []core.ChunkChoice) *core.ChatChunk {
		return &core.ChatChunk{ID: resp.ID, Object: "chat.completion.chunk", Created: resp.Created, Model: resp.Model, Choices: choices}
	}
	for _, c := range resp.Choices {
		if err := w.Chunk(mk([]core.ChunkChoice{{Index: c.Index, Delta: core.Delta{Role: "assistant"}}})); err != nil {
			return ErrStreamAborted
		}
		if err := w.Chunk(mk([]core.ChunkChoice{{Index: c.Index, Delta: core.Delta{Content: c.Message.Content.String(), ToolCalls: c.Message.ToolCalls}}})); err != nil {
			return ErrStreamAborted
		}
		fr := c.FinishReason
		if fr == "" {
			fr = "stop"
		}
		if err := w.Chunk(mk([]core.ChunkChoice{{Index: c.Index, FinishReason: &fr}})); err != nil {
			return ErrStreamAborted
		}
	}
	if includeUsage && resp.Usage != nil {
		c := mk([]core.ChunkChoice{})
		c.Usage = resp.Usage
		if err := w.Chunk(c); err != nil {
			return ErrStreamAborted
		}
	}
	return nil
}
