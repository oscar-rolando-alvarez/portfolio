package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/audit"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/cache"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/config"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/governance"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/guardrails"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/routing"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/telemetry"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/tokens"
)

// defaultOutputEstimate is used for pre-flight token estimates when the
// client does not set max_tokens.
const defaultOutputEstimate = 256

// idempotencyTTL bounds how long Idempotency-Key replays are kept.
const idempotencyTTL = 24 * time.Hour

// Deps are the injected collaborators of the Gateway.
type Deps struct {
	Registry    *routing.Registry
	Governor    *governance.Governor
	Cache       *cache.Cache // nil disables caching
	Idempotency core.KV      // nil disables Idempotency-Key support
	Audit       audit.Sink
	Metrics     *telemetry.Metrics
	Logger      *slog.Logger
	Now         func() time.Time
}

// Gateway is the application service.
type Gateway struct {
	rt atomic.Pointer[Runtime]
	Deps
}

// New creates a gateway serving rt.
func New(rt *Runtime, d Deps) *Gateway {
	if d.Now == nil {
		d.Now = time.Now
	}
	if d.Audit == nil {
		d.Audit = audit.Nop{}
	}
	g := &Gateway{Deps: d}
	g.rt.Store(rt)
	return g
}

// Runtime returns the active configuration snapshot.
func (g *Gateway) Runtime() *Runtime { return g.rt.Load() }

// Swap atomically replaces the runtime (hot reload).
func (g *Gateway) Swap(rt *Runtime) { g.rt.Store(rt) }

// Meta carries transport-level request information.
type Meta struct {
	RequestID      string
	Endpoint       string
	CacheBypass    bool
	IdempotencyKey string
}

// Info describes how a request was served (exposed as response headers).
type Info struct {
	Provider       string
	ProviderModel  string
	Cache          string
	BudgetWarning  bool
	Fallbacks      int
	Replayed       bool
	PIIRedacted    int
	InjectionScore float64
}

// StreamWriter receives a streaming response.
type StreamWriter interface {
	// Begin is called exactly once before the first chunk.
	Begin(info Info) error
	Chunk(c *core.ChatChunk) error
}

// Authenticate resolves a bearer token against the active runtime.
func (g *Gateway) Authenticate(token string) (governance.Principal, error) {
	return g.Runtime().Auth.Authenticate(token)
}

// Models lists the aliases a principal may use.
func (g *Gateway) Models(p governance.Principal) []core.ModelInfo {
	rt := g.Runtime()
	out := make([]core.ModelInfo, 0, len(rt.Aliases))
	for _, a := range rt.Aliases {
		if governance.ModelAllowed(p.Tenant, a) {
			out = append(out, core.ModelInfo{ID: a, Object: "model", Created: 0, OwnedBy: "llm-gateway"})
		}
	}
	return out
}

// exchange is the per-request working state shared by the pipeline stages.
type exchange struct {
	rt        *Runtime
	p         governance.Principal
	meta      Meta
	route     *routing.Route
	req       *core.ChatRequest // after guardrails
	start     time.Time
	estPrompt int
	estOutput int
	info      Info
	ev        *audit.Event
	span      trace.Span
	lookup    cache.Lookup
	cacheSet  cache.Settings
	cacheable bool
}

func (g *Gateway) newEvent(x *exchange) *audit.Event {
	return &audit.Event{
		Time: x.start.UTC(), RequestID: x.meta.RequestID, Tenant: x.p.Tenant.ID, KeyID: x.p.KeyID,
		Endpoint: x.meta.Endpoint, ModelAlias: x.req.Model, Stream: x.req.Stream, Cache: cache.Bypass,
	}
}

// prepare runs every pre-upstream stage: validation, entitlement,
// guardrails, budget, rate limit and cache lookup.
func (g *Gateway) prepare(ctx context.Context, p governance.Principal, in *core.ChatRequest, meta Meta) (*exchange, error) {
	x := &exchange{rt: g.Runtime(), p: p, meta: meta, start: g.Now(), req: in}
	x.ev = g.newEvent(x)
	x.span = trace.SpanFromContext(ctx)
	x.span.SetAttributes(telemetry.AttrTenant.String(p.Tenant.ID), telemetry.AttrAlias.String(in.Model),
		telemetry.AttrGenAIOperation.String("chat"), telemetry.AttrGenAIRequestModel.String(in.Model))

	if err := in.Validate(); err != nil {
		return x, core.Errorf(http.StatusBadRequest, core.CodeInvalidRequest, "%s", err.Error())
	}
	route, ok := x.rt.Routes[in.Model]
	if !ok || route.Kind != "chat" {
		return x, core.Errorf(http.StatusNotFound, core.CodeModelNotFound, "model %q does not exist", in.Model)
	}
	if !governance.ModelAllowed(p.Tenant, in.Model) {
		return x, core.Errorf(http.StatusForbidden, core.CodePermission, "model %q is not enabled for this API key", in.Model)
	}
	x.route = route

	req, err := g.applyInputGuardrails(ctx, x, in)
	if err != nil {
		return x, err
	}
	x.req = req

	st, err := g.Governor.CheckBudget(ctx, p.Tenant)
	if err != nil {
		return x, err
	}
	x.info.BudgetWarning = st.Warning
	x.ev.BudgetWarning = st.Warning

	x.estPrompt = tokens.EstimatePrompt(req)
	x.estOutput = req.MaxOutputTokens(defaultOutputEstimate)
	if err := g.Governor.CheckRate(ctx, p.Tenant, x.estPrompt+x.estOutput); err != nil {
		return x, err
	}

	cc := p.Tenant.Cache
	x.cacheable = g.Cache != nil && cc.IsEnabled() && cache.Cacheable(req)
	x.info.Cache, x.ev.Cache = cache.Bypass, cache.Bypass
	if x.cacheable && !meta.CacheBypass {
		x.cacheSet = cache.Settings{TTL: cc.TTL, Semantic: cc.SemanticEnabled(), SemanticThreshold: float32(cc.SemanticThreshold)}
		l, err := g.Cache.Get(ctx, p.Tenant.ID, req, x.cacheSet)
		if err != nil {
			g.Logger.WarnContext(ctx, "cache lookup failed", "err", err)
		}
		x.lookup = l
		x.info.Cache, x.ev.Cache = l.Kind, l.Kind
		if l.Kind == "" {
			x.info.Cache, x.ev.Cache = cache.Miss, cache.Miss
		}
		g.Metrics.Cache.WithLabelValues(p.Tenant.ID, x.info.Cache).Inc()
	} else if x.cacheable {
		// Explicit bypass still refreshes the cache with the new answer.
		x.cacheSet = cache.Settings{TTL: cc.TTL, Semantic: cc.SemanticEnabled(), SemanticThreshold: float32(cc.SemanticThreshold)}
		x.lookup = g.Cache.Prepare(p.Tenant.ID, req)
		g.Metrics.Cache.WithLabelValues(p.Tenant.ID, cache.Bypass).Inc()
	}
	x.span.SetAttributes(telemetry.AttrCache.String(x.info.Cache))
	return x, nil
}

// applyInputGuardrails scores prompt injection and redacts/blocks PII on a
// copy of the request. System/developer messages are trusted operator
// content and are not modified.
func (g *Gateway) applyInputGuardrails(ctx context.Context, x *exchange, in *core.ChatRequest) (*core.ChatRequest, error) {
	gr := x.p.Tenant.Guardrails
	tenant := x.p.Tenant.ID
	if gr.Injection != config.ActionOff {
		var best guardrails.InjectionResult
		for _, m := range in.Messages {
			if m.Role != "user" && m.Role != "tool" && m.Role != "function" {
				continue
			}
			if r := guardrails.ScoreInjection(m.Content.String()); r.Score > best.Score {
				best = r
			}
		}
		x.ev.InjectionScore, x.ev.InjectionRules = round3(best.Score), best.Rules
		x.info.InjectionScore = best.Score
		x.span.SetAttributes(telemetry.AttrInjection.Float64(best.Score))
		if best.Score >= gr.InjectionThreshold {
			action := gr.Injection
			g.Metrics.Guardrails.WithLabelValues(tenant, "prompt_injection", action).Inc()
			if action == config.ActionBlock {
				return nil, core.Errorf(http.StatusBadRequest, core.CodeInjectionBlocked,
					"request blocked by prompt-injection policy (score %.2f, rules: %s)", best.Score, strings.Join(best.Rules, ","))
			}
			g.Logger.InfoContext(ctx, "prompt injection flagged", "tenant", tenant, "score", best.Score, "rules", best.Rules)
		}
	}
	if gr.PII == config.ActionOff {
		return in, nil
	}
	scanner := x.rt.Scanner(tenant)
	out := in.Clone()
	findings := guardrails.Findings{}
	for i := range out.Messages {
		m := &out.Messages[i]
		if m.Role == "system" || m.Role == "developer" {
			continue
		}
		m.Content.MapText(func(s string) string { return scanner.Redact(s, findings) })
	}
	if n := findings.Total(); n > 0 {
		x.ev.PIIFindings = findings
		x.span.SetAttributes(telemetry.AttrPII.Int(n))
		g.Metrics.Guardrails.WithLabelValues(tenant, "pii", gr.PII).Add(float64(n))
		if gr.PII == config.ActionBlock {
			return nil, core.Errorf(http.StatusBadRequest, core.CodePIIBlocked,
				"request contains personal data (%s) which this tenant's policy blocks", findingTypes(findings))
		}
		x.info.PIIRedacted = n
		return out, nil
	}
	return in, nil
}

func findingTypes(f guardrails.Findings) string {
	var ts []string
	for _, t := range guardrails.AllPIITypes {
		if f[t] > 0 {
			ts = append(ts, t)
		}
	}
	return strings.Join(ts, ",")
}

func round3(f float64) float64 { return math.Round(f*1000) / 1000 }

// redactResponse applies response-side PII redaction if the tenant enabled it.
func (g *Gateway) redactResponse(x *exchange, resp *core.ChatResponse) {
	if !x.p.Tenant.Guardrails.ResponseRedaction {
		return
	}
	scanner := x.rt.Scanner(x.p.Tenant.ID)
	f := guardrails.Findings{}
	for i := range resp.Choices {
		resp.Choices[i].Message.Content.MapText(func(s string) string { return scanner.Redact(s, f) })
	}
	if n := f.Total(); n > 0 {
		x.ev.ResponsePII = f
		g.Metrics.Guardrails.WithLabelValues(x.p.Tenant.ID, "response_pii", config.ActionRedact).Add(float64(n))
	}
}

// Chat serves a non-streaming chat completion.
func (g *Gateway) Chat(ctx context.Context, p governance.Principal, in *core.ChatRequest, meta Meta) (resp *core.ChatResponse, info Info, err error) {
	g.Metrics.InFlight.Inc()
	defer g.Metrics.InFlight.Dec()

	var x *exchange
	defer func() {
		if x != nil {
			g.finish(ctx, x, err)
			info = x.info
		}
	}()

	x, err = g.prepare(ctx, p, in, meta)
	if err != nil {
		return nil, Info{}, err
	}

	// Idempotency-Key replay / concurrent-duplicate protection.
	var idemKey string
	if meta.IdempotencyKey != "" && g.Idempotency != nil {
		var replay *core.ChatResponse
		idemKey, replay, err = g.idemBegin(ctx, x)
		if err != nil {
			return nil, x.info, err
		}
		if replay != nil {
			x.info.Replayed = true
			x.ev.Cache = "idempotent_replay"
			return replay, x.info, nil
		}
		defer func() {
			if err != nil {
				_ = g.Idempotency.Delete(context.WithoutCancel(ctx), idemKey)
			}
		}()
	}

	if x.lookup.Response != nil {
		resp = x.lookup.Response
		resp.ID = "chatcmpl-cache-" + shortHash(meta.RequestID)
		resp.Created = g.Now().Unix()
		g.accountCacheHit(ctx, x, resp)
	} else {
		resp, err = g.callUpstream(ctx, x)
		if err != nil {
			return nil, x.info, err
		}
		g.redactResponse(x, resp)
		g.storeCache(ctx, x, resp)
	}
	if idemKey != "" {
		g.idemComplete(ctx, x, idemKey, resp)
	}
	return resp, x.info, nil
}

// callUpstream routes the request with fallback/hedging and accounts usage.
func (g *Gateway) callUpstream(ctx context.Context, x *exchange) (*core.ChatResponse, error) {
	plan := g.Registry.Plan(x.route, x.estPrompt, x.estOutput)
	res, err := routing.Execute(ctx, g.Registry, x.route, plan, routing.Options{AllowHedge: true},
		func(ctx context.Context, t routing.Target) (*core.ChatResponse, error) {
			req := *x.req
			req.Model = t.Model
			ctx, span := g.startProviderSpan(ctx, "chat", t, &req)
			resp, err := t.Provider.Chat(ctx, &req)
			endProviderSpan(span, resp, err)
			return resp, err
		})
	g.recordAttempts(x, res.Attempts, res.Fallbacks(), res.Hedged)
	if err != nil {
		return nil, err
	}
	resp := res.Value
	resp.Model = x.req.Model // clients see the alias they asked for
	usage := core.Usage{}
	if resp.Usage != nil {
		usage = *resp.Usage
	} else {
		usage = core.Usage{PromptTokens: x.estPrompt, CompletionTokens: tokens.EstimateText(firstContent(resp))}
		usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens
	}
	g.accountUpstream(ctx, x, res.Target, usage)
	return resp, nil
}

func firstContent(resp *core.ChatResponse) string {
	if resp == nil || len(resp.Choices) == 0 {
		return ""
	}
	return resp.Choices[0].Message.Content.String()
}

func (g *Gateway) recordAttempts(x *exchange, attempts []routing.Attempt, fallbacks int, hedged bool) {
	n := 0
	for _, a := range attempts {
		if !a.Skipped {
			n++
		}
	}
	x.ev.Attempts, x.ev.Fallbacks, x.ev.Hedged = n, fallbacks, hedged
	x.info.Fallbacks = fallbacks
	x.span.SetAttributes(telemetry.AttrFallbacks.Int(fallbacks))
}

// accountUpstream records cost, tokens and budget usage for a served request.
func (g *Gateway) accountUpstream(ctx context.Context, x *exchange, t routing.Target, u core.Usage) {
	cost := t.EstimateCostUSD(u.PromptTokens, u.CompletionTokens)
	tenant := x.p.Tenant.ID
	x.info.Provider, x.info.ProviderModel = t.Provider.Name(), t.Model
	x.ev.Provider, x.ev.ProviderModel = t.Provider.Name(), t.Model
	x.ev.PromptTokens, x.ev.CompletionTokens, x.ev.CostUSD = u.PromptTokens, u.CompletionTokens, roundCost(cost)
	g.Metrics.Tokens.WithLabelValues(tenant, x.req.Model, t.Provider.Name(), "input").Add(float64(u.PromptTokens))
	g.Metrics.Tokens.WithLabelValues(tenant, x.req.Model, t.Provider.Name(), "output").Add(float64(u.CompletionTokens))
	g.Metrics.CostUSD.WithLabelValues(tenant, x.req.Model, t.Provider.Name()).Add(cost)
	x.span.SetAttributes(telemetry.AttrCostUSD.Float64(cost), telemetry.AttrGenAIProvider.String(t.Provider.Name()),
		telemetry.AttrGenAIInputTokens.Int(u.PromptTokens), telemetry.AttrGenAIOutputTokens.Int(u.CompletionTokens))
	bg := context.WithoutCancel(ctx)
	g.Governor.Record(bg, core.UsageRecord{
		Tenant: tenant, Model: x.req.Model, Usage: u, CostNanos: int64(math.Round(cost * 1e9)),
	})
	g.Governor.Reconcile(bg, x.p.Tenant, x.estPrompt+x.estOutput, u.PromptTokens+u.CompletionTokens)
}

// accountCacheHit records a cache hit (zero upstream spend) and the
// estimated savings priced at the route's primary target.
func (g *Gateway) accountCacheHit(ctx context.Context, x *exchange, resp *core.ChatResponse) {
	tenant := x.p.Tenant.ID
	var saved float64
	if resp.Usage != nil && len(x.route.Targets) > 0 {
		saved = x.route.Targets[0].EstimateCostUSD(resp.Usage.PromptTokens, resp.Usage.CompletionTokens)
	}
	g.Metrics.CacheSavingsUSD.WithLabelValues(tenant, x.req.Model).Add(saved)
	x.info.Provider = "cache"
	x.ev.Provider = "cache"
	resp.Model = x.req.Model
	g.Governor.Record(context.WithoutCancel(ctx), core.UsageRecord{Tenant: tenant, Model: x.req.Model, CacheHit: true})
}

func roundCost(c float64) float64 { return math.Round(c*1e8) / 1e8 }

// finish emits metrics and the audit record for every request outcome.
func (g *Gateway) finish(ctx context.Context, x *exchange, err error) {
	status := http.StatusOK
	if err != nil {
		ge := core.AsError(err)
		status = ge.Status
		x.ev.ErrorCode = ge.Code
		x.span.SetStatus(codes.Error, ge.Code)
		x.span.SetAttributes(telemetry.AttrErrorType.String(ge.Code))
	}
	elapsed := g.Now().Sub(x.start)
	x.ev.Status = status
	x.ev.LatencyMS = float64(elapsed.Microseconds()) / 1000
	if sc := x.span.SpanContext(); sc.HasTraceID() {
		x.ev.TraceID = sc.TraceID().String()
	}
	if x.req != nil && len(x.req.Messages) > 0 {
		x.ev.PromptSHA256 = promptHash(x.req)
	}
	g.Metrics.Requests.WithLabelValues(x.p.Tenant.ID, x.meta.Endpoint, x.ev.ModelAlias, strconv.Itoa(status)).Inc()
	g.Metrics.RequestDuration.WithLabelValues(x.meta.Endpoint, x.ev.ModelAlias, x.ev.Cache).Observe(elapsed.Seconds())
	g.Audit.Write(ctx, x.ev)
}

func promptHash(req *core.ChatRequest) string {
	b, _ := json.Marshal(req.Messages)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func shortHash(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:6])
}

// startProviderSpan opens a GenAI client span for one provider attempt.
func (g *Gateway) startProviderSpan(ctx context.Context, op string, t routing.Target, req *core.ChatRequest) (context.Context, trace.Span) {
	attrs := []attribute.KeyValue{
		telemetry.AttrGenAIOperation.String(op),
		telemetry.AttrGenAIProvider.String(t.Provider.Name()),
		telemetry.AttrGenAIRequestModel.String(t.Model),
	}
	if req != nil {
		if mt := req.MaxOutputTokens(0); mt > 0 {
			attrs = append(attrs, telemetry.AttrGenAIMaxTokens.Int(mt))
		}
		if req.Temperature != nil {
			attrs = append(attrs, telemetry.AttrGenAITemperature.Float64(*req.Temperature))
		}
		if req.TopP != nil {
			attrs = append(attrs, telemetry.AttrGenAITopP.Float64(*req.TopP))
		}
	}
	return telemetry.Tracer().Start(ctx, op+" "+t.Model, trace.WithSpanKind(trace.SpanKindClient), trace.WithAttributes(attrs...))
}

func endProviderSpan(span trace.Span, resp *core.ChatResponse, err error) {
	defer span.End()
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, core.AsError(err).Code)
		span.SetAttributes(telemetry.AttrErrorType.String(core.AsError(err).Code))
		return
	}
	if resp == nil {
		return
	}
	finish := make([]string, 0, len(resp.Choices))
	for _, c := range resp.Choices {
		finish = append(finish, c.FinishReason)
	}
	span.SetAttributes(telemetry.AttrGenAIResponseModel.String(resp.Model), telemetry.AttrGenAIResponseID.String(resp.ID),
		telemetry.AttrGenAIFinishReasons.StringSlice(finish))
	if resp.Usage != nil {
		span.SetAttributes(telemetry.AttrGenAIInputTokens.Int(resp.Usage.PromptTokens),
			telemetry.AttrGenAIOutputTokens.Int(resp.Usage.CompletionTokens))
	}
}

// ---------------------------------------------------------------- idempotency

type idemRecord struct {
	State       string             `json:"state"` // pending|done
	Fingerprint string             `json:"fp"`
	Response    *core.ChatResponse `json:"resp,omitempty"`
}

func (g *Gateway) idemBegin(ctx context.Context, x *exchange) (string, *core.ChatResponse, error) {
	sum := sha256.Sum256([]byte(x.meta.IdempotencyKey))
	key := "idem:" + x.p.Tenant.ID + ":" + hex.EncodeToString(sum[:])
	fp := promptHash(x.req) + ":" + x.req.Model
	pending, _ := json.Marshal(idemRecord{State: "pending", Fingerprint: fp})
	ok, err := g.Idempotency.SetNX(ctx, key, pending, idempotencyTTL)
	if err != nil {
		g.Logger.WarnContext(ctx, "idempotency store unavailable, proceeding", "err", err)
		return "", nil, nil
	}
	if ok {
		return key, nil, nil
	}
	b, found, err := g.Idempotency.Get(ctx, key)
	if err != nil || !found {
		return "", nil, nil //nolint:nilerr // degrade to a normal request
	}
	var rec idemRecord
	if json.Unmarshal(b, &rec) != nil {
		return "", nil, nil
	}
	if rec.Fingerprint != fp {
		return "", nil, core.Errorf(http.StatusUnprocessableEntity, core.CodeIdempotencyInUse,
			"Idempotency-Key was already used with a different request body")
	}
	if rec.State != "done" || rec.Response == nil {
		return "", nil, core.Errorf(http.StatusConflict, core.CodeIdempotencyInUse,
			"a request with this Idempotency-Key is still in progress")
	}
	return "", rec.Response, nil
}

func (g *Gateway) idemComplete(ctx context.Context, x *exchange, key string, resp *core.ChatResponse) {
	b, err := json.Marshal(idemRecord{State: "done", Fingerprint: promptHash(x.req) + ":" + x.req.Model, Response: resp})
	if err == nil {
		err = g.Idempotency.Set(context.WithoutCancel(ctx), key, b, idempotencyTTL)
	}
	if err != nil {
		g.Logger.WarnContext(ctx, "idempotency store failed", "err", err)
	}
}

// ErrStreamAborted is reported when the client disconnects mid-stream.
var ErrStreamAborted = &core.Error{Status: 499, Type: "api_error", Code: core.CodeClientClosed, Message: "stream aborted by client"}

func spanFrom(ctx context.Context) trace.Span { return trace.SpanFromContext(ctx) }
