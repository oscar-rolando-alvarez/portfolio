package server

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/gateway/internal/agg"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/gateway/internal/hub"
)

type state struct {
	a     *agg.Aggregator
	ready bool
}

func (s *state) Aggregator(t string) *agg.Aggregator {
	if t == "acme" {
		return s.a
	}
	return nil
}
func (s *state) Tenants() []string { return []string{"acme", "globex"} }
func (s *state) RecentIncidents(string) []json.RawMessage {
	return []json.RawMessage{json.RawMessage(`{"incident":{"incident_id":"inc-1"}}`)}
}
func (s *state) Ready() bool                 { return s.ready }
func (s *state) Metrics() map[string]float64 { return map[string]float64{"fleetgw_kafka_ready": 1} }

func digest(k string) string { s := sha256.Sum256([]byte(k)); return hex.EncodeToString(s[:]) }

func setup(t *testing.T, keys map[string]string) (*httptest.Server, *hub.Hub, *state) {
	t.Helper()
	a := agg.New(agg.Config{CellsEvery: 1})
	a.Add(&agg.Event{Tenant: "acme", DeviceID: "dev-00000001", CellID: "310-260-1000-1", ConnState: "connected", RAT: "LTE"}, 10)
	a.Tick()
	st := &state{a: a}
	h := hub.New(8, 8, 8)
	srv := httptest.NewServer(New(Config{APIKeys: keys, DefaultTenant: "acme", AllowedOrigins: []string{"http://localhost:3000"}, Heartbeat: 20 * time.Millisecond}, h, st))
	t.Cleanup(srv.Close)
	return srv, h, st
}

func get(t *testing.T, url string, hdr map[string]string) *http.Response {
	t.Helper()
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, url, http.NoBody)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

type sse struct{ event, data string }

func readEvents(t *testing.T, r *bufio.Reader, n int) []sse {
	t.Helper()
	var out []sse
	var cur sse
	for len(out) < n {
		line, err := r.ReadString('\n')
		if err != nil {
			t.Fatalf("read: %v (got %d events)", err, len(out))
		}
		line = strings.TrimRight(line, "\n")
		switch {
		case strings.HasPrefix(line, "event: "):
			cur.event = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			cur.data = strings.TrimPrefix(line, "data: ")
		case line == "" && cur.event != "":
			out = append(out, cur)
			cur = sse{}
		}
	}
	return out
}

func TestStreamHelloSnapshotThenLiveFrames(t *testing.T) {
	srv, h, _ := setup(t, nil)
	resp := get(t, srv.URL+"/v1/stream", map[string]string{"Origin": "http://localhost:3000"})
	defer func() { _ = resp.Body.Close() }()
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content type %q", ct)
	}
	if resp.Header.Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Fatal("CORS origin not echoed")
	}
	r := bufio.NewReader(resp.Body)
	evs := readEvents(t, r, 3)
	if evs[0].event != "hello" || evs[1].event != "snapshot" || evs[2].event != "cells" {
		t.Fatalf("initial events: %+v", evs)
	}
	var hello struct {
		Mode      string            `json:"mode"`
		Tenant    string            `json:"tenant"`
		History   []agg.Point       `json:"history"`
		Incidents []json.RawMessage `json:"incidents"`
	}
	if err := json.Unmarshal([]byte(evs[0].data), &hello); err != nil {
		t.Fatal(err)
	}
	if hello.Mode != "live" || hello.Tenant != "acme" || len(hello.History) != 1 || len(hello.Incidents) != 1 {
		t.Fatalf("hello: %+v", hello)
	}
	// wait for the subscription, then publish a live frame
	deadline := time.Now().Add(2 * time.Second)
	for h.Stats().Clients == 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	h.Publish("acme", hub.Frame{Event: "incident", Data: []byte(`{"id":1}`)})
	if ev := readEvents(t, r, 1)[0]; ev.event != "incident" || ev.data != `{"id":1}` {
		t.Fatalf("live frame: %+v", ev)
	}
}

func TestAuthTenantScopingAndErrors(t *testing.T) {
	srv, _, _ := setup(t, map[string]string{digest("secret"): "acme"})
	cases := []struct {
		path, key string
		want      int
	}{
		{"/v1/stream", "", http.StatusUnauthorized},
		{"/v1/stream", "nope", http.StatusUnauthorized},
		{"/v1/stream?tenant=globex", "secret", http.StatusForbidden},
		{"/v1/snapshot", "secret", http.StatusOK},
		{"/v1/tenants", "secret", http.StatusOK},
	}
	for _, c := range cases {
		resp := get(t, srv.URL+c.path, map[string]string{"x-api-key": c.key})
		body, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if resp.StatusCode != c.want {
			t.Fatalf("%s key=%q: %d %s", c.path, c.key, resp.StatusCode, body)
		}
		if c.path == "/v1/tenants" && !strings.Contains(string(body), `["acme"]`) {
			t.Fatalf("tenant list leaks other tenants: %s", body)
		}
	}
}

func TestHealthReadinessMetricsAndSnapshot(t *testing.T) {
	srv, _, st := setup(t, nil)
	check := func(path string, want int, contains string) {
		t.Helper()
		resp := get(t, srv.URL+path, nil)
		defer func() { _ = resp.Body.Close() }()
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != want || !strings.Contains(string(body), contains) {
			t.Fatalf("%s: %d %s", path, resp.StatusCode, body)
		}
	}
	check("/healthz", 200, `"ok"`)
	check("/readyz", 503, "false")
	st.ready = true
	check("/readyz", 200, "true")
	check("/metrics", 200, "fleetgw_sse_clients 0")
	check("/v1/snapshot", 200, `"eventsPerSec"`)
	check("/v1/snapshot?tenant=globex", 404, "no telemetry")
	check("/v1/tenants", 200, "globex")
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodOptions, srv.URL+"/v1/stream", http.NoBody)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("preflight %d", resp.StatusCode)
	}
}

func TestTooManyClients(t *testing.T) {
	a := agg.New(agg.Config{})
	h := hub.New(1, 1, 1)
	h.Subscribe(hub.Options{Tenant: "acme"})
	srv := httptest.NewServer(New(Config{DefaultTenant: "acme"}, h, &state{a: a}))
	defer srv.Close()
	resp := get(t, srv.URL+"/v1/stream", nil)
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("want 503, got %d", resp.StatusCode)
	}
}
