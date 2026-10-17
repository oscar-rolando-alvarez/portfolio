// Package incidents follows the platform's incident API and turns changes
// into "incident" frames for the live stream.
//
// The platform persists incidents, enrichment and bilingual diagnoses in
// DynamoDB and serves them over the tenant-scoped HTTP API; the gateway polls
// that API (cheap single-query reads) instead of reaching into the table, so
// the API stays the only read path and its authorisation model applies. In
// AWS the same role is a DynamoDB Streams -> EventBridge Pipes -> gateway
// push; the poller keeps the local stack dependency-free.
package incidents

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"sync"
	"sync/atomic"
	"time"
)

// Summary is the subset of a platform incident the poller needs to detect changes.
type Summary struct {
	IncidentID string `json:"incident_id"`
	Tenant     string `json:"tenant"`
	Status     string `json:"status"`
	ScopeType  string `json:"scope_type"`
	Scope      string `json:"scope"`
	OpenedAt   string `json:"opened_at"`
	LastSeenAt string `json:"last_seen_at"`
	Windows    int    `json:"windows"`
}

// Detection relates the gateway's live anomaly signal to the confirmed incident.
type Detection struct {
	GatewayOnsetMs int64   `json:"gatewayOnsetMs,omitempty"`
	ConfirmedMs    int64   `json:"confirmedMs"`
	LeadSeconds    float64 `json:"leadSeconds,omitempty"` // how long the live signal preceded confirmation
}

// View is what the dashboard receives (SSE event "incident"). Platform
// payloads are passed through untouched (snake_case, as served by the API).
type View struct {
	Incident   json.RawMessage            `json:"incident"`
	Enrichment json.RawMessage            `json:"enrichment"`
	Diagnosis  map[string]json.RawMessage `json:"diagnosis"` // locale -> diagnosis record
	Detection  Detection                  `json:"detection"`
	summary    Summary
}

// Publisher receives encoded views.
type Publisher func(tenant string, data []byte)

// OnsetFunc returns when the live gateway first flagged a scope (unix ms) or 0.
type OnsetFunc func(tenant, scopeType, scope string) int64

// Config configures the poller.
type Config struct {
	BaseURL  string
	APIKey   string
	Interval time.Duration
	Locales  []string
	Limit    int
	Keep     int // most recent incidents kept for late joiners
	Client   *http.Client
	Logger   *slog.Logger
	Clock    func() time.Time
}

// Poller tracks incidents for the tenant owning APIKey.
type Poller struct {
	cfg     Config
	publish Publisher
	onset   OnsetFunc
	mu      sync.Mutex
	views   map[string]*View
	errors  atomic.Uint64
	polls   atomic.Uint64
}

// New builds a Poller.
func New(cfg Config, publish Publisher, onset OnsetFunc) *Poller {
	if cfg.Interval <= 0 {
		cfg.Interval = 2 * time.Second
	}
	if len(cfg.Locales) == 0 {
		cfg.Locales = []string{"en", "es"}
	}
	if cfg.Limit <= 0 {
		cfg.Limit = 50
	}
	if cfg.Keep <= 0 {
		cfg.Keep = 50
	}
	if cfg.Client == nil {
		cfg.Client = &http.Client{Timeout: 5 * time.Second}
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.DiscardHandler)
	}
	if cfg.Clock == nil {
		cfg.Clock = time.Now
	}
	return &Poller{cfg: cfg, publish: publish, onset: onset, views: map[string]*View{}}
}

// Run polls until ctx is cancelled.
func (p *Poller) Run(ctx context.Context) {
	t := time.NewTicker(p.cfg.Interval)
	defer t.Stop()
	for {
		if err := p.Poll(ctx); err != nil && !errors.Is(err, context.Canceled) {
			p.errors.Add(1)
			p.cfg.Logger.Warn("incident poll failed", "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// Poll performs one list + detail round.
func (p *Poller) Poll(ctx context.Context) error {
	p.polls.Add(1)
	var list struct {
		Items []json.RawMessage `json:"items"`
	}
	if err := p.get(ctx, fmt.Sprintf("/v1/incidents?limit=%d", p.cfg.Limit), &list); err != nil {
		return err
	}
	for _, raw := range list.Items {
		var s Summary
		if err := json.Unmarshal(raw, &s); err != nil || s.IncidentID == "" {
			continue
		}
		p.mu.Lock()
		prev := p.views[s.IncidentID]
		p.mu.Unlock()
		if prev != nil && prev.summary == s {
			continue
		}
		v, err := p.detail(ctx, s)
		if err != nil {
			return err
		}
		if prev != nil {
			v.Detection = prev.Detection
		} else {
			now := p.cfg.Clock().UnixMilli()
			v.Detection.ConfirmedMs = now
			if p.onset != nil {
				if on := p.onset(s.Tenant, s.ScopeType, s.Scope); on > 0 && on <= now {
					v.Detection.GatewayOnsetMs = on
					v.Detection.LeadSeconds = float64(now-on) / 1000
				}
			}
		}
		p.store(v)
		data, err := json.Marshal(v)
		if err != nil {
			return err
		}
		p.publish(s.Tenant, data)
	}
	return nil
}

func (p *Poller) detail(ctx context.Context, s Summary) (*View, error) {
	v := &View{summary: s, Diagnosis: map[string]json.RawMessage{}}
	for _, loc := range p.cfg.Locales {
		var d struct {
			Incident   json.RawMessage `json:"incident"`
			Enrichment json.RawMessage `json:"enrichment"`
			Diagnosis  json.RawMessage `json:"diagnosis"`
		}
		path := "/v1/incidents/" + url.PathEscape(s.IncidentID) + "?locale=" + url.QueryEscape(loc)
		if err := p.get(ctx, path, &d); err != nil {
			return nil, err
		}
		v.Incident, v.Enrichment = d.Incident, d.Enrichment
		if len(d.Diagnosis) > 0 && string(d.Diagnosis) != "null" {
			v.Diagnosis[loc] = d.Diagnosis
		}
	}
	return v, nil
}

func (p *Poller) store(v *View) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.views[v.summary.IncidentID] = v
	if len(p.views) <= p.cfg.Keep {
		return
	}
	all := make([]*View, 0, len(p.views))
	for _, x := range p.views {
		all = append(all, x)
	}
	slices.SortFunc(all, func(a, b *View) int { return cmp.Compare(b.summary.OpenedAt, a.summary.OpenedAt) })
	for _, x := range all[p.cfg.Keep:] {
		delete(p.views, x.summary.IncidentID)
	}
}

// Recent returns encoded views for tenant, newest first.
func (p *Poller) Recent(tenant string) []json.RawMessage {
	p.mu.Lock()
	defer p.mu.Unlock()
	var vs []*View
	for _, v := range p.views {
		if v.summary.Tenant == tenant {
			vs = append(vs, v)
		}
	}
	slices.SortFunc(vs, func(a, b *View) int { return cmp.Compare(b.summary.OpenedAt, a.summary.OpenedAt) })
	out := make([]json.RawMessage, 0, len(vs))
	for _, v := range vs {
		if data, err := json.Marshal(v); err == nil {
			out = append(out, data)
		}
	}
	return out
}

// Stats returns (polls, errors, tracked incidents).
func (p *Poller) Stats() (polls, errs uint64, tracked int) {
	p.mu.Lock()
	n := len(p.views)
	p.mu.Unlock()
	return p.polls.Load(), p.errors.Load(), n
}

func (p *Poller) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.cfg.BaseURL+path, http.NoBody)
	if err != nil {
		return err
	}
	req.Header.Set("x-api-key", p.cfg.APIKey)
	req.Header.Set("accept", "application/json")
	resp, err := p.cfg.Client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("GET %s: %s", path, resp.Status)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(out)
}
