// Package telemetry wires structured logging, Prometheus metrics and
// OpenTelemetry tracing (with GenAI semantic-convention attributes).
package telemetry

import (
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

// Metrics holds every Prometheus collector exposed by the gateway.
type Metrics struct {
	Registry *prometheus.Registry

	Requests        *prometheus.CounterVec
	RequestDuration *prometheus.HistogramVec
	TTFT            *prometheus.HistogramVec
	Tokens          *prometheus.CounterVec
	CostUSD         *prometheus.CounterVec
	Cache           *prometheus.CounterVec
	UpstreamLatency *prometheus.HistogramVec
	UpstreamErrors  *prometheus.CounterVec
	Fallbacks       *prometheus.CounterVec
	Hedges          *prometheus.CounterVec
	CircuitState    *prometheus.GaugeVec
	Guardrails      *prometheus.CounterVec
	Rejections      *prometheus.CounterVec
	CacheSavingsUSD *prometheus.CounterVec
	Budget          *prometheus.CounterVec
	InFlight        prometheus.Gauge
}

var latencyBuckets = []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2, 4, 8, 16, 32, 64}

// NewMetrics registers all collectors on a fresh registry.
func NewMetrics() *Metrics {
	r := prometheus.NewRegistry()
	r.MustRegister(collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	f := func(c prometheus.Collector) { r.MustRegister(c) }
	m := &Metrics{Registry: r}

	m.Requests = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "llmgw_requests_total", Help: "Gateway requests by tenant, endpoint, model alias and status code.",
	}, []string{"tenant", "endpoint", "model", "status"})
	m.RequestDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name: "llmgw_request_duration_seconds", Help: "End-to-end request latency.", Buckets: latencyBuckets,
	}, []string{"endpoint", "model", "cache"})
	m.TTFT = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name: "llmgw_time_to_first_token_seconds", Help: "Streaming time to first token.", Buckets: latencyBuckets,
	}, []string{"model", "provider"})
	m.Tokens = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "llmgw_tokens_total", Help: "Tokens processed (type=input|output).",
	}, []string{"tenant", "model", "provider", "type"})
	m.CostUSD = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "llmgw_cost_usd_total", Help: "Estimated upstream spend in USD.",
	}, []string{"tenant", "model", "provider"})
	m.Cache = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "llmgw_cache_requests_total", Help: "Cache lookups by result (exact|semantic|miss|bypass).",
	}, []string{"tenant", "result"})
	m.UpstreamLatency = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name: "llmgw_upstream_duration_seconds", Help: "Latency of individual provider attempts.", Buckets: latencyBuckets,
	}, []string{"target", "outcome"})
	m.UpstreamErrors = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "llmgw_upstream_errors_total", Help: "Failed provider attempts by error code.",
	}, []string{"target", "code"})
	m.Fallbacks = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "llmgw_fallbacks_total", Help: "Fallbacks from one target to the next.",
	}, []string{"model", "from", "to"})
	m.Hedges = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "llmgw_hedged_requests_total", Help: "Hedged requests by winning target.",
	}, []string{"model", "winner"})
	m.CircuitState = prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Name: "llmgw_circuit_breaker_state", Help: "Circuit state per target (0=closed, 1=half_open, 2=open).",
	}, []string{"target"})
	m.Guardrails = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "llmgw_guardrail_events_total", Help: "Guardrail detections by kind and action.",
	}, []string{"tenant", "kind", "action"})
	m.Rejections = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "llmgw_rate_limited_total", Help: "Requests rejected by rate limits (limit=requests|tokens).",
	}, []string{"tenant", "limit"})
	m.CacheSavingsUSD = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "llmgw_cache_savings_usd_total", Help: "Estimated upstream spend avoided by cache hits.",
	}, []string{"tenant", "model"})
	m.Budget = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "llmgw_budget_events_total", Help: "Budget warnings and rejections.",
	}, []string{"tenant", "event"})
	m.InFlight = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "llmgw_in_flight_requests", Help: "Requests currently being processed.",
	})
	for _, c := range []prometheus.Collector{m.Requests, m.RequestDuration, m.TTFT, m.Tokens, m.CostUSD, m.Cache,
		m.UpstreamLatency, m.UpstreamErrors, m.Fallbacks, m.Hedges, m.CircuitState, m.Guardrails, m.Rejections, m.CacheSavingsUSD,
		m.Budget, m.InFlight} {
		f(c)
	}
	return m
}

// RateLimited implements governance.Events.
func (m *Metrics) RateLimited(tenant, limit string) {
	m.Rejections.WithLabelValues(tenant, limit).Inc()
}

// BudgetEvent implements governance.Events.
func (m *Metrics) BudgetEvent(tenant, event string) {
	m.Budget.WithLabelValues(tenant, event).Inc()
}

// Attempt implements routing.Observer.
func (m *Metrics) Attempt(_, target string, err error, d time.Duration) {
	outcome := "success"
	if err != nil {
		outcome = "error"
		m.UpstreamErrors.WithLabelValues(target, core.AsError(err).Code).Inc()
	}
	m.UpstreamLatency.WithLabelValues(target, outcome).Observe(d.Seconds())
}

// Fallback implements routing.Observer.
func (m *Metrics) Fallback(alias, from, to string) {
	m.Fallbacks.WithLabelValues(alias, from, to).Inc()
}

// BreakerState implements routing.Observer.
func (m *Metrics) BreakerState(target, state string) {
	v := 0.0
	switch state {
	case "half_open":
		v = 1
	case "open":
		v = 2
	}
	m.CircuitState.WithLabelValues(target).Set(v)
}

// Hedge implements routing.Observer.
func (m *Metrics) Hedge(alias, winner string) {
	m.Hedges.WithLabelValues(alias, winner).Inc()
}
