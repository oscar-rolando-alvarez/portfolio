package agg

import (
	"fmt"
	"testing"
	"time"
)

type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time { return c.t }

func (c *fakeClock) advance(d time.Duration) { c.t = c.t.Add(d) }

func ev(device int, cell, state string) *Event {
	return &Event{
		Tenant: "acme", DeviceID: fmt.Sprintf("dev-%08d", device), CellID: cell, PLMN: "310260",
		RAT: "LTE-M", APN: "track.fleet.iot", RSRP: -95, SINR: 9, ConnState: state,
		Firmware: "TRK-1.8.4", LatencyMs: 200, PayloadBytes: 100,
	}
}

// feed sends one event per device per second on two cells for n seconds;
// failing(second) decides whether cell "A" is in outage.
func feed(a *Aggregator, clk *fakeClock, seconds int, failing func(int) bool) (last Snapshot) {
	for s := range seconds {
		for d := range 20 {
			cell, state := "310-260-1000-1", "connected"
			if d >= 10 {
				cell = "310-260-1000-2"
			} else if failing(s) {
				state = "no_service"
			}
			a.Add(ev(d, cell, state), 300)
		}
		clk.advance(time.Second)
		last, _ = a.Tick()
	}
	return last
}

func newAgg(clk *fakeClock) *Aggregator {
	return New(Config{Window: 5, MinEvents: 5, Clock: clk.now, CellsEvery: 1, OnlineTTL: 10 * time.Second})
}

func TestSnapshotCountsAndDistributions(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	a := newAgg(clk)
	s := feed(a, clk, 3, func(int) bool { return false })
	if s.EventsPerSec != 20 || s.BytesPerSec != 6000 || s.Connected != 20 {
		t.Fatalf("throughput: %+v", s)
	}
	if s.DevicesOnline != 20 || s.DevicesSeen != 20 || s.Availability != 1 {
		t.Fatalf("devices/availability: online=%d seen=%d avail=%v", s.DevicesOnline, s.DevicesSeen, s.Availability)
	}
	total := 0
	for _, c := range s.RSRP.Counts {
		total += c
	}
	if total != 20 || len(s.RSRP.Edges) != len(s.RSRP.Counts)+1 || s.RATMix["LTE-M"] != 20 {
		t.Fatalf("histogram/rat: %d %v", total, s.RATMix)
	}
	if s.LatencyMs != 200 || s.Seq != 3 || len(s.Anomalies) != 0 {
		t.Fatalf("latency/seq/anomalies: %+v", s)
	}
}

func TestOutageRaisesAnomalyWithOnsetAndRanksCellFirst(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	a := newAgg(clk)
	s := feed(a, clk, 40, func(sec int) bool { return sec >= 30 })
	if s.AnomalyScore < 0.9 || len(s.Anomalies) == 0 {
		t.Fatalf("expected strong anomaly, got %v %+v", s.AnomalyScore, s.Anomalies)
	}
	an := s.Anomalies[0]
	if an.Scope != "310-260-1000-1" || an.Kind != "cell_outage" || an.ScopeType != "cell" || an.OnsetMs == 0 {
		t.Fatalf("anomaly: %+v", an)
	}
	if s.TopCells[0].Key != "310-260-1000-1" || s.TopCells[0].Health > 0.1 {
		t.Fatalf("top cells: %+v", s.TopCells)
	}
	if s.Availability > 0.6 || s.DevicesOnline != 10 {
		t.Fatalf("availability %v online %d", s.Availability, s.DevicesOnline)
	}
	if a.Onset("cell", "310-260-1000-1") != an.OnsetMs || a.Onset("cell", "nope") != 0 {
		t.Fatal("onset lookup")
	}
	// recovery: score decays, onset is remembered for MTTD
	s = feed(a, clk, 10, func(int) bool { return false })
	if s.AnomalyScore != 0 || a.Onset("cell", "310-260-1000-1") != an.OnsetMs {
		t.Fatalf("recovery: %v", s.AnomalyScore)
	}
}

func TestBaselineNotPoisonedByFault(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	a := newAgg(clk)
	s := feed(a, clk, 120, func(sec int) bool { return sec >= 20 })
	if s.AnomalyScore < 0.9 {
		t.Fatalf("a long fault must stay anomalous, got %v", s.AnomalyScore)
	}
}

func TestDimensionsFirmwareRoamingAPN(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	a := newAgg(clk)
	for s := range 40 {
		for d := range 30 {
			e := ev(d, "310-260-1000-1", "connected")
			e.Roaming, e.PLMN = true, "26201"
			if s >= 30 && d < 15 {
				e.ResetReason = "watchdog"
				e.ConnState, e.Cause = "attach_reject", "EMM_15"
			}
			a.Add(e, 100)
		}
		clk.advance(time.Second)
		a.Tick()
	}
	snap, _ := a.Tick()
	kinds := map[string]bool{}
	for _, an := range snap.Anomalies {
		kinds[an.Kind] = true
	}
	for _, k := range []string{"firmware_regression", "roaming_misconfig", "cell_outage"} {
		if !kinds[k] {
			t.Fatalf("missing %s in %+v", k, snap.Anomalies)
		}
	}
	if snap.TopCarriers[0].Key != "26201" || snap.TopFirmware[0].Key != "TRK-1.8.4" || len(snap.TopAPNs) != 1 {
		t.Fatalf("top lists: %+v %+v", snap.TopCarriers, snap.TopFirmware)
	}
}

func TestCellFrameHistoryAndEviction(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	a := New(Config{Window: 5, MinEvents: 5, Clock: clk.now, CellsEvery: 2, History: 3, OnlineTTL: 5 * time.Second, IdleEvict: 20 * time.Second})
	var frames int
	for range 4 {
		a.Add(ev(1, "310-260-1000-7", "connected"), 10)
		clk.advance(time.Second)
		if _, f := a.Tick(); f != nil {
			frames++
			if len(f.IDs) != 1 || f.IDs[0] != "310-260-1000-7" || f.Online[0] != 1 || f.Health[0] != 100 {
				t.Fatalf("frame: %+v", f)
			}
		}
	}
	if frames != 2 {
		t.Fatalf("frames=%d", frames)
	}
	hist, latest, cells := a.State()
	if len(hist) != 3 || latest == nil || cells == nil {
		t.Fatalf("state: %d %v %v", len(hist), latest, cells)
	}
	clk.advance(30 * time.Second)
	s, _ := a.Tick()
	if s.DevicesSeen != 0 || len(a.scopes["cell"]) != 0 {
		t.Fatalf("eviction: seen=%d cells=%d", s.DevicesSeen, len(a.scopes["cell"]))
	}
	if s.Availability != 1 || s.EventsPerSec != 0 {
		t.Fatalf("idle snapshot: %+v", s)
	}
}

func TestSampleBudgetDownsamplesDistributionsOnly(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	a := New(Config{SampleBudget: 10, Clock: clk.now})
	for d := range 100 {
		a.Add(ev(d, "310-260-1000-1", "connected"), 1)
	}
	clk.advance(time.Second)
	s, _ := a.Tick()
	if s.EventsPerSec != 100 || s.SampledEvents != 10 || s.RATMix["LTE-M"] != 10 {
		t.Fatalf("sampling: %+v", s)
	}
}

func TestRegistryValidatesAndCapsTenants(t *testing.T) {
	r := NewRegistry(Config{}, 2)
	e := ev(1, "c", "connected")
	for _, tenant := range []string{"a", "b", "c", "BAD TENANT"} {
		e.Tenant = tenant
		r.Add(e, 1)
	}
	if got := r.Tenants(); len(got) != 2 || got[0] != "a" || r.Rejected() != 2 || r.Get("c") != nil {
		t.Fatalf("tenants=%v rejected=%d", got, r.Rejected())
	}
	if !r.Add(e2("a"), 1) {
		t.Fatal("known tenant must be accepted")
	}
}

func e2(t string) *Event { e := ev(2, "c", "connected"); e.Tenant = t; return e }

func BenchmarkAdd(b *testing.B) {
	a := New(Config{})
	events := make([]*Event, 4096)
	for i := range events {
		events[i] = ev(i, fmt.Sprintf("310-260-1000-%d", i%200), "connected")
	}
	b.ResetTimer()
	for i := range b.N {
		a.Add(events[i%len(events)], 400)
	}
}
