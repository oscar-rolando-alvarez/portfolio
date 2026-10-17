package sim

import (
	"bytes"
	"context"
	"crypto/sha256"
	"runtime"
	"testing"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/simulator/internal/faults"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/simulator/internal/fleet"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/simulator/internal/sink"
)

var start = time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)

func runOnce(t testing.TB, devices, shards int, sched string, dur time.Duration) ([]byte, Stats) {
	t.Helper()
	f, err := fleet.New(fleet.Config{Devices: devices, Seed: 99, Tenant: "acme", Density: 50, IntervalScale: 1})
	if err != nil {
		t.Fatal(err)
	}
	rs, err := faults.Resolve([]faults.Spec{{Type: "cell_outage", Target: "auto", Start: faults.Duration(time.Minute),
		Duration: faults.Duration(time.Minute), Intensity: 1}}, f)
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	out := sink.NewWriter(&buf)
	st, err := Run(context.Background(), f, Config{Start: start, Duration: dur, Shards: shards, Scheduler: sched, Faults: rs}, out)
	if err != nil {
		t.Fatal(err)
	}
	if err := out.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes(), st
}

func TestRunIsReproducible(t *testing.T) {
	a, sa := runOnce(t, 3000, 4, "wheel", 5*time.Minute)
	b, _ := runOnce(t, 3000, 4, "wheel", 5*time.Minute)
	if sha256.Sum256(a) != sha256.Sum256(b) {
		t.Fatal("same seed + shard count must produce identical output")
	}
	if sa.Events == 0 || uint64(bytes.Count(a, []byte("\n"))) != sa.Events {
		t.Fatalf("events=%d lines=%d", sa.Events, bytes.Count(a, []byte("\n")))
	}
	if !bytes.Contains(a, []byte(`"conn_state":"no_service","reconnects":0,"latency_ms":0`)) {
		t.Fatal("injected outage not visible in output")
	}
}

func TestSchedulersProduceSameEventCount(t *testing.T) {
	_, w := runOnce(t, 2000, 1, "wheel", 10*time.Minute)
	_, h := runOnce(t, 2000, 1, "heap", 10*time.Minute)
	if w.Events != h.Events || w.Bytes != h.Bytes {
		t.Fatalf("wheel %d/%d vs heap %d/%d", w.Events, w.Bytes, h.Events, h.Bytes)
	}
	// Expected volume: sum over devices of duration/interval (+/- jitter).
	if w.Events < 10_000 {
		t.Fatalf("too few events: %d", w.Events)
	}
}

func TestPacingHonoursSpeed(t *testing.T) {
	f, _ := fleet.New(fleet.Config{Devices: 10, Seed: 1, Tenant: "acme", Density: 5, IntervalScale: 1})
	t0 := time.Now()
	_, err := Run(context.Background(), f, Config{Start: start, Duration: 4 * time.Second, Speed: 20, Shards: 1}, &sink.Discard{})
	if err != nil {
		t.Fatal(err)
	}
	if el := time.Since(t0); el < 150*time.Millisecond {
		t.Fatalf("4 virtual seconds at 20x should take ~200ms, took %s", el)
	}
}

func TestRunValidation(t *testing.T) {
	f, _ := fleet.New(fleet.Config{Devices: 10, Seed: 1, Tenant: "acme", Density: 5, IntervalScale: 1})
	if _, err := Run(context.Background(), f, Config{Duration: 0}, &sink.Discard{}); err == nil {
		t.Fatal("zero duration must fail")
	}
	if _, err := Run(context.Background(), f, Config{Duration: time.Second, Scheduler: "nope"}, &sink.Discard{}); err == nil {
		t.Fatal("unknown scheduler must fail")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Run(ctx, f, Config{Duration: time.Minute}, &sink.Discard{}); err == nil {
		t.Fatal("cancelled context must stop the run")
	}
}

// BenchmarkFleet1M simulates one million devices for 5 virtual minutes per
// iteration and reports the sustained generation rate.
func BenchmarkFleet1M(b *testing.B) {
	f, err := fleet.New(fleet.Config{Devices: 1_000_000, Seed: 1, Tenant: "acme", Density: 50, IntervalScale: 1})
	if err != nil {
		b.Fatal(err)
	}
	var events uint64
	b.ResetTimer()
	for b.Loop() {
		d := &sink.Discard{}
		st, err := Run(context.Background(), f, Config{Start: start, Duration: 5 * time.Minute, Shards: runtime.GOMAXPROCS(0)}, d)
		if err != nil {
			b.Fatal(err)
		}
		events += st.Events
	}
	b.ReportMetric(float64(events)/b.Elapsed().Seconds(), "events/s")
	b.ReportMetric(1_000_000, "devices")
}
