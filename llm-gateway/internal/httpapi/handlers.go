package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"slices"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/app"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/governance"
)

func (s *server) chatCompletions(w http.ResponseWriter, r *http.Request) {
	var req core.ChatRequest
	if err := decodeJSON(w, r, s.MaxBodyBytes, &req); err != nil {
		writeError(w, err)
		return
	}
	p := principal(r.Context())
	m := meta(r, "chat")
	if req.Stream {
		sw := &sseWriter{w: w, rc: http.NewResponseController(w)}
		err := s.Gateway.ChatStream(r.Context(), p, &req, m, sw)
		switch {
		case err == nil:
			sw.done()
		case !sw.started:
			writeError(w, err)
		default:
			sw.fail(err)
		}
		return
	}
	resp, info, err := s.Gateway.Chat(r.Context(), p, &req, m)
	setInfoHeaders(w.Header(), info)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// sseWriter adapts app.StreamWriter to Server-Sent Events.
type sseWriter struct {
	w       http.ResponseWriter
	rc      *http.ResponseController
	started bool
}

func (s *sseWriter) Begin(info app.Info) error {
	h := s.w.Header()
	setInfoHeaders(h, info)
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no") // disable proxy buffering (nginx)
	s.w.WriteHeader(http.StatusOK)
	s.started = true
	return s.rc.Flush()
}

func (s *sseWriter) write(b []byte) error {
	// Each event gets a fresh write deadline so slow-but-alive clients are
	// served while dead connections are reaped.
	_ = s.rc.SetWriteDeadline(time.Now().Add(30 * time.Second))
	if _, err := s.w.Write(b); err != nil {
		return err
	}
	return s.rc.Flush()
}

func (s *sseWriter) Chunk(c *core.ChatChunk) error {
	b, err := json.Marshal(c)
	if err != nil {
		return err
	}
	buf := make([]byte, 0, len(b)+8)
	buf = append(buf, "data: "...)
	buf = append(buf, b...)
	buf = append(buf, '\n', '\n')
	return s.write(buf)
}

func (s *sseWriter) done() { _ = s.write([]byte("data: [DONE]\n\n")) }

// fail reports a mid-stream error as a final SSE event (status is already 200).
func (s *sseWriter) fail(err error) {
	ge := core.AsError(err)
	if ge.Status == 499 {
		return
	}
	b, _ := json.Marshal(errorBody{Error: errorDetail{Message: ge.Message, Type: ge.Type, Code: ge.Code}})
	_ = s.write(append(append([]byte("data: "), b...), '\n', '\n'))
}

func (s *server) embeddings(w http.ResponseWriter, r *http.Request) {
	var req core.EmbeddingRequest
	if err := decodeJSON(w, r, s.MaxBodyBytes, &req); err != nil {
		writeError(w, err)
		return
	}
	resp, info, err := s.Gateway.Embeddings(r.Context(), principal(r.Context()), &req, meta(r, "embeddings"))
	setInfoHeaders(w.Header(), info)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) models(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"object": "list", "data": s.Gateway.Models(principal(r.Context()))})
}

func (s *server) model(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	for _, m := range s.Gateway.Models(principal(r.Context())) {
		if m.ID == id {
			writeJSON(w, http.StatusOK, m)
			return
		}
	}
	writeError(w, core.Errorf(http.StatusNotFound, core.CodeModelNotFound, "model %q does not exist", id))
}

func (s *server) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": s.Version})
}

func (s *server) readyz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	for _, p := range s.Ready {
		if err := p.Ping(ctx); err != nil {
			s.Logger.WarnContext(ctx, "readiness check failed", "err", err)
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

// ---------------------------------------------------------------- admin

var periodRe = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

type tenantUsage struct {
	core.UsageSummary
	Budget struct {
		MonthlyTokens int64   `json:"monthly_tokens"`
		MonthlyUSD    float64 `json:"monthly_usd"`
		Mode          string  `json:"mode"`
		UsedRatio     float64 `json:"used_ratio"`
	} `json:"budget"`
	CacheHitRatio float64 `json:"cache_hit_ratio"`
}

func (s *server) usage(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	if period == "" {
		period = governance.Period(time.Now())
	}
	if !periodRe.MatchString(period) {
		writeError(w, core.Errorf(http.StatusBadRequest, core.CodeInvalidRequest, "period must be YYYY-MM"))
		return
	}
	only := r.URL.Query().Get("tenant")
	rt := s.Gateway.Runtime()
	out := []tenantUsage{}
	var totalCost float64
	for _, t := range rt.Config.Tenants {
		if only != "" && t.ID != only {
			continue
		}
		u, err := s.Gateway.Governor.Usage().Get(r.Context(), t.ID, period)
		if err != nil {
			writeError(w, err)
			return
		}
		tu := tenantUsage{UsageSummary: u}
		tu.Budget.MonthlyTokens, tu.Budget.MonthlyUSD, tu.Budget.Mode = t.Budget.MonthlyTokens, t.Budget.MonthlyUSD, t.Budget.Mode
		if t.Budget.MonthlyUSD > 0 {
			tu.Budget.UsedRatio = u.CostUSD / t.Budget.MonthlyUSD
		}
		if t.Budget.MonthlyTokens > 0 {
			tu.Budget.UsedRatio = max(tu.Budget.UsedRatio, float64(u.TotalTokens)/float64(t.Budget.MonthlyTokens))
		}
		if u.Requests > 0 {
			tu.CacheHitRatio = float64(u.CacheHits) / float64(u.Requests)
		}
		totalCost += u.CostUSD
		out = append(out, tu)
	}
	if only != "" && len(out) == 0 {
		writeError(w, core.Errorf(http.StatusNotFound, "not_found", "unknown tenant %q", only))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"period": period, "total_cost_usd": totalCost, "tenants": out})
}

func (s *server) tenants(w http.ResponseWriter, _ *http.Request) {
	rt := s.Gateway.Runtime()
	type view struct {
		ID     string   `json:"id"`
		Name   string   `json:"name"`
		KeyIDs []string `json:"key_ids"`
		Rules  any      `json:"rules"`
	}
	out := make([]view, 0, len(rt.Config.Tenants))
	for _, t := range rt.Config.Tenants {
		v := view{ID: t.ID, Name: t.Name, Rules: t.TenantRules}
		for _, k := range t.Keys {
			v.KeyIDs = append(v.KeyIDs, k.ID)
		}
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"tenants": out, "config_version": rt.Version})
}

func (s *server) routes(w http.ResponseWriter, _ *http.Request) {
	rt := s.Gateway.Runtime()
	states := s.Gateway.Registry.BreakerStates()
	type target struct {
		ID           string  `json:"id"`
		Weight       int     `json:"weight"`
		InputPerMTok float64 `json:"input_cost_per_mtok"`
		OutPerMTok   float64 `json:"output_cost_per_mtok"`
		Circuit      string  `json:"circuit"`
		LatencyMS    float64 `json:"latency_ewma_ms"`
	}
	type route struct {
		Alias   string   `json:"alias"`
		Kind    string   `json:"kind"`
		Policy  string   `json:"policy"`
		Hedge   bool     `json:"hedge"`
		Targets []target `json:"targets"`
	}
	out := []route{}
	for _, a := range rt.Aliases {
		rr := rt.Routes[a]
		ro := route{Alias: a, Kind: rr.Kind, Policy: rr.Policy, Hedge: rr.Hedge.Enabled}
		for _, t := range rr.Targets {
			st := states[t.ID()]
			if st == "" {
				st = "closed"
			}
			ro.Targets = append(ro.Targets, target{ID: t.ID(), Weight: t.Weight, InputPerMTok: t.InputCostPerMTok,
				OutPerMTok: t.OutputCostPerMTok, Circuit: st,
				LatencyMS: float64(s.Gateway.Registry.Latency(t.ID()).Microseconds()) / 1000})
		}
		out = append(out, ro)
	}
	slices.SortFunc(out, func(a, b route) int {
		if a.Alias < b.Alias {
			return -1
		}
		return 1
	})
	writeJSON(w, http.StatusOK, map[string]any{"routes": out})
}

func (s *server) reload(w http.ResponseWriter, r *http.Request) {
	if s.Reload == nil {
		writeError(w, core.Errorf(http.StatusNotFound, "not_found", "reload disabled"))
		return
	}
	if err := s.Reload(r.Context()); err != nil {
		writeError(w, core.Errorf(http.StatusUnprocessableEntity, core.CodeInvalidRequest, "reload failed: %s", err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "reloaded", "config_version": s.Gateway.Runtime().Version})
}
