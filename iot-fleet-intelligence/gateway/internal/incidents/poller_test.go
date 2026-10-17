package incidents

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeAPI struct {
	mu     sync.Mutex
	status string
	calls  []string
}

func (f *fakeAPI) handler(t *testing.T) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		if r.Header.Get("x-api-key") != "k" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		f.calls = append(f.calls, r.URL.String())
		inc := map[string]any{
			"incident_id": "inc-1", "tenant": "acme", "status": f.status, "scope_type": "cell",
			"scope": "310-260-1000-1", "opened_at": "2026-10-01T00:08:00Z", "last_seen_at": "2026-10-01T00:09:00Z",
		}
		switch {
		case r.URL.Path == "/v1/incidents":
			_ = json.NewEncoder(w).Encode(map[string]any{"items": []any{inc, map[string]any{"bad": 1}}})
		case strings.HasPrefix(r.URL.Path, "/v1/incidents/inc-1"):
			loc := r.URL.Query().Get("locale")
			var diag any
			if f.status == "DIAGNOSED" {
				diag = map[string]any{"locale": loc, "diagnosis": map[string]any{"summary": "summary-" + loc}}
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"incident": inc, "enrichment": nil, "diagnosis": diag})
		default:
			t.Errorf("unexpected path %s", r.URL)
		}
	})
}

func TestPollerPublishesNewAndChangedIncidentsWithBothLocales(t *testing.T) {
	api := &fakeAPI{status: "OPEN"}
	srv := httptest.NewServer(api.handler(t))
	defer srv.Close()
	var got [][]byte
	now := time.UnixMilli(10_000)
	p := New(Config{BaseURL: srv.URL, APIKey: "k", Clock: func() time.Time { return now }},
		func(tenant string, data []byte) {
			if tenant != "acme" {
				t.Errorf("tenant %s", tenant)
			}
			got = append(got, data)
		},
		func(_, scopeType, scope string) int64 {
			if scopeType == "cell" && scope == "310-260-1000-1" {
				return 4_000
			}
			return 0
		})
	ctx := context.Background()
	if err := p.Poll(ctx); err != nil {
		t.Fatal(err)
	}
	if err := p.Poll(ctx); err != nil { // unchanged: no detail calls, no publish
		t.Fatal(err)
	}
	api.mu.Lock()
	api.status = "DIAGNOSED"
	api.mu.Unlock()
	now = time.UnixMilli(20_000)
	if err := p.Poll(ctx); err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("published %d frames, want 2 (new + status change)", len(got))
	}
	var v struct {
		Diagnosis map[string]struct {
			Diagnosis struct{ Summary string } `json:"diagnosis"`
		} `json:"diagnosis"`
		Detection Detection `json:"detection"`
	}
	if err := json.Unmarshal(got[1], &v); err != nil {
		t.Fatal(err)
	}
	if v.Diagnosis["es"].Diagnosis.Summary != "summary-es" || v.Diagnosis["en"].Diagnosis.Summary != "summary-en" {
		t.Fatalf("locales: %+v", v.Diagnosis)
	}
	// detection timing is fixed at first sight, not at later status changes
	if v.Detection.GatewayOnsetMs != 4_000 || v.Detection.ConfirmedMs != 10_000 || v.Detection.LeadSeconds != 6 {
		t.Fatalf("detection: %+v", v.Detection)
	}
	if recent := p.Recent("acme"); len(recent) != 1 || len(p.Recent("other")) != 0 {
		t.Fatalf("recent: %d", len(recent))
	}
	polls, errs, n := p.Stats()
	if polls != 3 || errs != 0 || n != 1 {
		t.Fatalf("stats %d %d %d", polls, errs, n)
	}
}

func TestPollerSurfacesHTTPErrorsAndRunStops(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()
	p := New(Config{BaseURL: srv.URL, APIKey: "wrong", Interval: 10 * time.Millisecond}, func(string, []byte) {}, nil)
	if err := p.Poll(context.Background()); err == nil || !strings.Contains(err.Error(), "401") {
		t.Fatalf("want 401 error, got %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	p.Run(ctx)
	if _, errs, _ := p.Stats(); errs == 0 {
		t.Fatal("Run must count poll errors")
	}
}

func TestStoreKeepsMostRecent(t *testing.T) {
	p := New(Config{Keep: 2}, func(string, []byte) {}, nil)
	for i, opened := range []string{"2026-10-01T00:01:00Z", "2026-10-01T00:03:00Z", "2026-10-01T00:02:00Z"} {
		p.store(&View{summary: Summary{IncidentID: string(rune('a' + i)), Tenant: "t", OpenedAt: opened}})
	}
	if _, ok := p.views["a"]; ok || len(p.views) != 2 {
		t.Fatalf("oldest must be evicted: %v", p.views)
	}
}
