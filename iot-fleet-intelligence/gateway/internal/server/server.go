// Package server exposes the live stream over Server-Sent Events plus
// health, readiness and Prometheus-style metrics endpoints.
package server

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/gateway/internal/agg"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/gateway/internal/hub"
)

// Version is stamped at build time.
var Version = "0.1.0"

// State is what the server reads from the rest of the gateway.
type State interface {
	Aggregator(tenant string) *agg.Aggregator
	Tenants() []string
	RecentIncidents(tenant string) []json.RawMessage
	Ready() bool
	Metrics() map[string]float64
}

// Config configures the HTTP server.
type Config struct {
	// APIKeys maps sha256(key) -> tenant. Empty disables auth (local development only).
	APIKeys        map[string]string
	DefaultTenant  string
	AllowedOrigins []string
	Heartbeat      time.Duration
	Logger         *slog.Logger
}

// Server is the HTTP layer.
type Server struct {
	cfg   Config
	hub   *hub.Hub
	state State
	mux   *http.ServeMux
}

// New builds the server and its routes.
func New(cfg Config, h *hub.Hub, st State) *Server {
	if cfg.Heartbeat <= 0 {
		cfg.Heartbeat = 15 * time.Second
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.DiscardHandler)
	}
	s := &Server{cfg: cfg, hub: h, state: st, mux: http.NewServeMux()}
	s.mux.HandleFunc("GET /v1/stream", s.stream)
	s.mux.HandleFunc("GET /v1/snapshot", s.snapshot)
	s.mux.HandleFunc("GET /v1/tenants", s.tenants)
	s.mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": Version})
	})
	s.mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, _ *http.Request) {
		code := http.StatusOK
		if !st.Ready() {
			code = http.StatusServiceUnavailable
		}
		writeJSON(w, code, map[string]bool{"ready": code == http.StatusOK})
	})
	s.mux.HandleFunc("GET /metrics", s.metrics)
	return s
}

// ServeHTTP adds CORS and security headers.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("X-Content-Type-Options", "nosniff")
	if origin := r.Header.Get("Origin"); origin != "" && s.allowed(origin) {
		h.Set("Access-Control-Allow-Origin", origin)
		h.Set("Vary", "Origin")
		h.Set("Access-Control-Allow-Headers", "x-api-key, last-event-id")
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	s.mux.ServeHTTP(w, r)
}

func (s *Server) allowed(origin string) bool {
	for _, o := range s.cfg.AllowedOrigins {
		if o == "*" || strings.EqualFold(o, origin) {
			return true
		}
	}
	return false
}

// tenant authenticates the request and resolves the tenant it may read.
func (s *Server) tenant(r *http.Request) (string, int) {
	want := r.URL.Query().Get("tenant")
	if len(s.cfg.APIKeys) == 0 {
		if want == "" {
			want = s.cfg.DefaultTenant
		}
		return want, 0
	}
	key := r.Header.Get("x-api-key")
	if key == "" {
		return "", http.StatusUnauthorized
	}
	sum := sha256.Sum256([]byte(key))
	digest := hex.EncodeToString(sum[:])
	for known, tenant := range s.cfg.APIKeys {
		if subtle.ConstantTimeCompare([]byte(known), []byte(digest)) == 1 {
			if want != "" && want != tenant {
				return "", http.StatusForbidden
			}
			return tenant, 0
		}
	}
	return "", http.StatusUnauthorized
}

func (s *Server) stream(w http.ResponseWriter, r *http.Request) {
	tenant, code := s.tenant(r)
	if code != 0 {
		writeJSON(w, code, map[string]string{"error": http.StatusText(code)})
		return
	}
	q := r.URL.Query()
	every, _ := strconv.Atoi(q.Get("every"))
	every = min(max(every, 1), 60)
	cells := q.Get("cells") != "0"
	c := s.hub.Subscribe(hub.Options{Tenant: tenant, Every: every, Cells: cells})
	if c == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "too many clients"})
		return
	}
	defer s.hub.Unsubscribe(c)

	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Time{}) // long-lived response
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache, no-transform")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no") // disable proxy buffering (nginx, ALB-friendly)
	w.WriteHeader(http.StatusOK)

	var buf bytes.Buffer
	buf.WriteString("retry: 2000\n\n")
	hello := map[string]any{
		"version": Version, "mode": "live", "tenant": tenant, "serverTime": time.Now().UnixMilli(),
		"every": every, "history": []agg.Point{}, "incidents": s.state.RecentIncidents(tenant),
	}
	var latest *agg.Snapshot
	var frame *agg.CellFrame
	if a := s.state.Aggregator(tenant); a != nil {
		var hist []agg.Point
		hist, latest, frame = a.State()
		hello["history"] = hist
	}
	writeEvent(&buf, "hello", 0, hello)
	if latest != nil {
		writeEvent(&buf, "snapshot", latest.Seq, latest)
	}
	if frame != nil && cells {
		writeEvent(&buf, "cells", 0, frame)
	}
	if _, err := w.Write(buf.Bytes()); err != nil {
		return
	}
	_ = rc.Flush()
	s.cfg.Logger.Info("client connected", "tenant", tenant, "every", every, "cells", cells)

	hb := time.NewTicker(s.cfg.Heartbeat)
	defer hb.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-c.Kicked():
			s.cfg.Logger.Warn("slow client disconnected", "tenant", tenant, "dropped", c.Dropped())
			return
		case <-hb.C:
			if _, err := fmt.Fprintf(w, ": hb %d\n\n", time.Now().Unix()); err != nil {
				return
			}
		case f := <-c.Frames():
			buf.Reset()
			if f.ID > 0 {
				fmt.Fprintf(&buf, "id: %d\n", f.ID)
			}
			fmt.Fprintf(&buf, "event: %s\ndata: ", f.Event)
			buf.Write(f.Data)
			buf.WriteString("\n\n")
			// drain whatever else is queued into the same write (fewer syscalls under load)
			for len(c.Frames()) > 0 && buf.Len() < 256<<10 {
				f = <-c.Frames()
				fmt.Fprintf(&buf, "event: %s\ndata: ", f.Event)
				buf.Write(f.Data)
				buf.WriteString("\n\n")
			}
			if _, err := w.Write(buf.Bytes()); err != nil {
				return
			}
		}
		if err := rc.Flush(); err != nil {
			return
		}
	}
}

func writeEvent(buf *bytes.Buffer, event string, id uint64, v any) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	if id > 0 {
		fmt.Fprintf(buf, "id: %d\n", id)
	}
	fmt.Fprintf(buf, "event: %s\ndata: %s\n\n", event, data)
}

func (s *Server) snapshot(w http.ResponseWriter, r *http.Request) {
	tenant, code := s.tenant(r)
	if code != 0 {
		writeJSON(w, code, map[string]string{"error": http.StatusText(code)})
		return
	}
	a := s.state.Aggregator(tenant)
	if a == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no telemetry for tenant yet"})
		return
	}
	_, latest, _ := a.State()
	if latest == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no snapshot yet"})
		return
	}
	writeJSON(w, http.StatusOK, latest)
}

func (s *Server) tenants(w http.ResponseWriter, r *http.Request) {
	tenant, code := s.tenant(r)
	if code != 0 {
		writeJSON(w, code, map[string]string{"error": http.StatusText(code)})
		return
	}
	if len(s.cfg.APIKeys) > 0 { // an authenticated caller only learns about its own tenant
		writeJSON(w, http.StatusOK, map[string][]string{"tenants": {tenant}})
		return
	}
	writeJSON(w, http.StatusOK, map[string][]string{"tenants": s.state.Tenants()})
}

func (s *Server) metrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	m := s.state.Metrics()
	st := s.hub.Stats()
	m["fleetgw_sse_clients"] = float64(st.Clients)
	m["fleetgw_frames_published_total"] = float64(st.Published)
	m["fleetgw_frames_dropped_total"] = float64(st.Dropped)
	m["fleetgw_clients_kicked_total"] = float64(st.Kicked)
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	for _, k := range keys {
		_, _ = fmt.Fprintf(w, "%s %g\n", k, m[k])
	}
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
