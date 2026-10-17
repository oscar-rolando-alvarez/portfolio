package app

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/audit"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/config"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/governance"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/guardrails"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/routing"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/telemetry"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/tokens"
)

// maxEmbeddingInputs bounds a single embeddings request.
const maxEmbeddingInputs = 2048

// Embeddings serves an embeddings request with governance, PII redaction,
// routing and accounting.
func (g *Gateway) Embeddings(ctx context.Context, p governance.Principal, in *core.EmbeddingRequest, meta Meta) (resp *core.EmbeddingResponse, info Info, err error) {
	g.Metrics.InFlight.Inc()
	defer g.Metrics.InFlight.Dec()
	rt := g.Runtime()
	start := g.Now()
	ev := &audit.Event{Time: start.UTC(), RequestID: meta.RequestID, Tenant: p.Tenant.ID, KeyID: p.KeyID,
		Endpoint: meta.Endpoint, ModelAlias: in.Model, Cache: "bypass"}
	x := &exchange{rt: rt, p: p, meta: meta, start: start, ev: ev, req: &core.ChatRequest{Model: in.Model}}
	x.span = spanFrom(ctx)
	x.span.SetAttributes(telemetry.AttrTenant.String(p.Tenant.ID), telemetry.AttrAlias.String(in.Model),
		telemetry.AttrGenAIOperation.String("embeddings"), telemetry.AttrGenAIRequestModel.String(in.Model))
	defer func() {
		x.req = nil // embeddings have no chat prompt hash
		g.finish(ctx, x, err)
		info = x.info
	}()

	inputs, err := in.Inputs()
	if err != nil {
		return nil, Info{}, core.Errorf(http.StatusBadRequest, core.CodeInvalidRequest, "%s", err.Error())
	}
	if len(inputs) > maxEmbeddingInputs {
		return nil, Info{}, core.Errorf(http.StatusBadRequest, core.CodeInvalidRequest, "at most %d inputs per request", maxEmbeddingInputs)
	}
	route, ok := rt.Routes[in.Model]
	if !ok || route.Kind != "embedding" {
		return nil, Info{}, core.Errorf(http.StatusNotFound, core.CodeModelNotFound, "embedding model %q does not exist", in.Model)
	}
	if !governance.ModelAllowed(p.Tenant, in.Model) {
		return nil, Info{}, core.Errorf(http.StatusForbidden, core.CodePermission, "model %q is not enabled for this API key", in.Model)
	}
	x.route = route

	// Embeddings are frequently persisted in vector stores, so PII is
	// redacted before it can be indexed downstream.
	gr := p.Tenant.Guardrails
	if gr.PII != config.ActionOff {
		f := guardrails.Findings{}
		sc := rt.Scanner(p.Tenant.ID)
		for i, s := range inputs {
			inputs[i] = sc.Redact(s, f)
		}
		if n := f.Total(); n > 0 {
			ev.PIIFindings = f
			g.Metrics.Guardrails.WithLabelValues(p.Tenant.ID, "pii", gr.PII).Add(float64(n))
			if gr.PII == config.ActionBlock {
				return nil, Info{}, core.Errorf(http.StatusBadRequest, core.CodePIIBlocked, "input contains personal data (%s)", findingTypes(f))
			}
			x.info.PIIRedacted = n
		}
	}

	if _, err := g.Governor.CheckBudget(ctx, p.Tenant); err != nil {
		return nil, Info{}, err
	}
	est := 0
	for _, s := range inputs {
		est += tokens.EstimateText(s)
	}
	if err := g.Governor.CheckRate(ctx, p.Tenant, est); err != nil {
		return nil, Info{}, err
	}

	raw, _ := json.Marshal(inputs)
	req := *in
	req.Input = raw
	res, err := routing.Execute(ctx, g.Registry, route, g.Registry.Plan(route, est, 0), routing.Options{AllowHedge: true},
		func(ctx context.Context, t routing.Target) (*core.EmbeddingResponse, error) {
			r := req
			r.Model = t.Model
			ctx, span := g.startProviderSpan(ctx, "embeddings", t, nil)
			out, err := t.Provider.Embed(ctx, &r)
			endProviderSpan(span, nil, err)
			return out, err
		})
	g.recordAttempts(x, res.Attempts, res.Fallbacks(), res.Hedged)
	if err != nil {
		return nil, Info{}, err
	}
	resp = res.Value
	resp.Model = in.Model
	u := resp.Usage
	if u.PromptTokens == 0 {
		u = core.Usage{PromptTokens: est, TotalTokens: est}
	}
	cost := res.Target.EstimateCostUSD(u.PromptTokens, 0)
	t := res.Target
	x.info.Provider, x.info.ProviderModel = t.Provider.Name(), t.Model
	ev.Provider, ev.ProviderModel, ev.PromptTokens, ev.CostUSD = t.Provider.Name(), t.Model, u.PromptTokens, roundCost(cost)
	g.Metrics.Tokens.WithLabelValues(p.Tenant.ID, in.Model, t.Provider.Name(), "input").Add(float64(u.PromptTokens))
	g.Metrics.CostUSD.WithLabelValues(p.Tenant.ID, in.Model, t.Provider.Name()).Add(cost)
	g.Governor.Record(context.WithoutCancel(ctx), core.UsageRecord{Tenant: p.Tenant.ID, Model: in.Model, Usage: u,
		CostNanos: int64(math.Round(cost * 1e9))})
	g.Governor.Reconcile(context.WithoutCancel(ctx), p.Tenant, est, u.PromptTokens)
	return resp, x.info, nil
}

// RouteEmbedder adapts an embedding route to core.Embedder for the semantic
// cache. It shares breakers and fallback with client traffic.
type RouteEmbedder struct {
	G       *Gateway
	Timeout time.Duration
}

// Embed implements core.Embedder.
func (e *RouteEmbedder) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	rt := e.G.Runtime()
	alias := rt.Config.Embeddings.Alias
	route, ok := rt.Routes[alias]
	if !ok {
		return nil, errors.New("no embedding model configured for the semantic cache")
	}
	if e.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, e.Timeout)
		defer cancel()
	}
	raw, _ := json.Marshal(texts)
	res, err := routing.Execute(ctx, e.G.Registry, route, e.G.Registry.Plan(route, 0, 0), routing.Options{},
		func(ctx context.Context, t routing.Target) (*core.EmbeddingResponse, error) {
			return t.Provider.Embed(ctx, &core.EmbeddingRequest{Model: t.Model, Input: raw})
		})
	if err != nil {
		return nil, err
	}
	out := make([][]float32, len(res.Value.Data))
	for _, d := range res.Value.Data {
		if d.Index >= 0 && d.Index < len(out) {
			out[d.Index] = normalize(d.Embedding)
		}
	}
	return out, nil
}

func normalize(v []float32) []float32 {
	var n float64
	for _, x := range v {
		n += float64(x) * float64(x)
	}
	if n == 0 || math.Abs(n-1) < 1e-6 {
		return v
	}
	inv := float32(1 / math.Sqrt(n))
	out := make([]float32, len(v))
	for i, x := range v {
		out[i] = x * inv
	}
	return out
}
