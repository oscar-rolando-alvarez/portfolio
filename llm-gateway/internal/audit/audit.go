// Package audit writes one structured, redacted record per gateway request.
// Records never contain prompt or completion text: only metadata, counts and
// an optional SHA-256 of the (already redacted) prompt for correlation.
package audit

import (
	"context"
	"io"
	"log/slog"
	"time"
)

// Event is a single audit record.
type Event struct {
	Time             time.Time      `json:"time"`
	RequestID        string         `json:"request_id"`
	TraceID          string         `json:"trace_id,omitempty"`
	Tenant           string         `json:"tenant"`
	KeyID            string         `json:"key_id"`
	Endpoint         string         `json:"endpoint"`
	ModelAlias       string         `json:"model_alias"`
	Provider         string         `json:"provider,omitempty"`
	ProviderModel    string         `json:"provider_model,omitempty"`
	Status           int            `json:"status"`
	ErrorCode        string         `json:"error_code,omitempty"`
	Stream           bool           `json:"stream"`
	Cache            string         `json:"cache"`
	LatencyMS        float64        `json:"latency_ms"`
	PromptTokens     int            `json:"prompt_tokens"`
	CompletionTokens int            `json:"completion_tokens"`
	CostUSD          float64        `json:"cost_usd"`
	Attempts         int            `json:"attempts"`
	Fallbacks        int            `json:"fallbacks"`
	Hedged           bool           `json:"hedged,omitempty"`
	PIIFindings      map[string]int `json:"pii_findings,omitempty"`
	ResponsePII      map[string]int `json:"response_pii_findings,omitempty"`
	InjectionScore   float64        `json:"injection_score,omitempty"`
	InjectionRules   []string       `json:"injection_rules,omitempty"`
	PromptSHA256     string         `json:"prompt_sha256,omitempty"`
	BudgetWarning    bool           `json:"budget_warning,omitempty"`
}

// Sink receives audit events.
type Sink interface {
	Write(ctx context.Context, e *Event)
}

// SlogSink writes events as JSON lines through a dedicated slog logger.
type SlogSink struct{ l *slog.Logger }

// NewSlogSink writes JSON audit lines to w.
func NewSlogSink(w io.Writer) *SlogSink {
	h := slog.NewJSONHandler(w, &slog.HandlerOptions{
		ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			if a.Key == slog.MessageKey || a.Key == slog.LevelKey {
				return slog.Attr{} // drop: every line is an audit record
			}
			return a
		},
	})
	return &SlogSink{l: slog.New(h).With("log_type", "audit")}
}

// Write implements Sink.
func (s *SlogSink) Write(ctx context.Context, e *Event) {
	s.l.LogAttrs(ctx, slog.LevelInfo, "", slog.Any("event", e))
}

// Nop discards events.
type Nop struct{}

// Write implements Sink.
func (Nop) Write(context.Context, *Event) {}

// Memory collects events (tests and evals).
type Memory struct {
	ch chan Event
}

// NewMemory creates an in-memory sink with the given capacity.
func NewMemory(capacity int) *Memory { return &Memory{ch: make(chan Event, capacity)} }

// Write implements Sink. Events beyond capacity are dropped.
func (m *Memory) Write(_ context.Context, e *Event) {
	select {
	case m.ch <- *e:
	default:
	}
}

// Drain returns all buffered events.
func (m *Memory) Drain() []Event {
	var out []Event
	for {
		select {
		case e := <-m.ch:
			out = append(out, e)
		default:
			return out
		}
	}
}
