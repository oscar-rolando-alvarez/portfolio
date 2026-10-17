package faults

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/simulator/internal/fleet"
)

func testFleet(t *testing.T) *fleet.Fleet {
	t.Helper()
	f, err := fleet.New(fleet.Config{Devices: 5000, Seed: 1, Tenant: "acme", Density: 50, IntervalScale: 1})
	if err != nil {
		t.Fatal(err)
	}
	return f
}

func TestParseFlag(t *testing.T) {
	s, err := ParseFlag("congestion:target=auto,start=2m,duration=90s,intensity=0.5")
	if err != nil {
		t.Fatal(err)
	}
	if s.Type != "congestion" || time.Duration(s.Start) != 2*time.Minute || time.Duration(s.Duration) != 90*time.Second || s.Intensity != 0.5 {
		t.Fatalf("%+v", s)
	}
	for _, bad := range []string{"x:start", "x:start=zz", "x:intensity=a", "x:what=1"} {
		if _, err := ParseFlag(bad); err == nil {
			t.Fatalf("expected error for %q", bad)
		}
	}
}

func TestResolveAutoTargetsAndValidation(t *testing.T) {
	f := testFleet(t)
	specs := []Spec{
		{Type: "cell_outage", Target: "auto", Start: Duration(time.Minute), Duration: Duration(time.Minute), Intensity: 1},
		{Type: "congestion", Target: "auto", Duration: Duration(time.Minute), Intensity: 1},
		{Type: "roaming_misconfig", Target: "auto", Duration: Duration(time.Minute), Intensity: 1},
		{Type: "apn_error", Target: "auto", Duration: Duration(time.Minute), Intensity: 1},
		{Type: "firmware_regression", Target: "auto", Duration: Duration(time.Minute), Intensity: 1},
	}
	rs, err := Resolve(specs, f)
	if err != nil {
		t.Fatal(err)
	}
	if rs[0].Target == rs[1].Target {
		t.Fatal("two auto cell faults must hit distinct cells")
	}
	if rs[0].Start != 60 || rs[0].End != 120 {
		t.Fatalf("window %d-%d", rs[0].Start, rs[0].End)
	}
	for _, r := range rs {
		if r.Affected == 0 || r.Scope == "" {
			t.Fatalf("fault %s resolved to empty scope: %+v", r.Kind, r)
		}
	}
	if rs[3].Scope != "track.fleet.iot" || rs[4].Scope != "MTR-3.3.1" {
		t.Fatalf("unexpected scopes %s %s", rs[3].Scope, rs[4].Scope)
	}

	bad := []Spec{
		{Type: "meteor_strike", Target: "auto", Duration: Duration(time.Minute), Intensity: 1},
		{Type: "cell_outage", Target: "auto", Duration: Duration(time.Minute), Intensity: 2},
		{Type: "cell_outage", Target: "auto", Duration: 0, Intensity: 1},
		{Type: "apn_error", Target: "nope", Duration: Duration(time.Minute), Intensity: 1},
	}
	for _, b := range bad {
		if _, err := Resolve([]Spec{b}, f); err == nil {
			t.Fatalf("expected error for %+v", b)
		}
	}
}

func TestActiveWindow(t *testing.T) {
	rs := []Resolved{{Kind: fleet.CellOutage, Target: 3, Start: 10, End: 20, Intensity: 1}}
	if len(Active(rs, 9, nil)) != 0 || len(Active(rs, 10, nil)) != 1 || len(Active(rs, 20, nil)) != 0 {
		t.Fatal("active window must be [start, end)")
	}
}

func TestLoadScenarioAndManifest(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "s.json")
	if err := os.WriteFile(p, []byte(`{"name":"demo","faults":[{"type":"cell_outage","target":"auto","start":"1m","duration":"2m","intensity":0.9}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := Load(p)
	if err != nil {
		t.Fatal(err)
	}
	f := testFleet(t)
	rs, err := Resolve(s.Faults, f)
	if err != nil {
		t.Fatal(err)
	}
	start := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	m := BuildManifest(s.Name, 1, "acme", f.Len(), start, 5*time.Minute, rs)
	if m.Faults[0].Start != "2026-10-01T00:01:00Z" || m.Faults[0].End != "2026-10-01T00:03:00Z" || m.Faults[0].ScopeType != "cell" {
		t.Fatalf("%+v", m.Faults[0])
	}
	if err := os.WriteFile(p, []byte(`{"name":"x","unknown":1}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(p); err == nil {
		t.Fatal("unknown fields must be rejected")
	}
}
