package fleet

import (
	"bytes"
	"encoding/json"
	"testing"
)

func newFleet(t testing.TB, n int) *Fleet {
	t.Helper()
	f, err := New(Config{Devices: n, Seed: 7, Tenant: "acme", Density: 50, IntervalScale: 1})
	if err != nil {
		t.Fatal(err)
	}
	return f
}

type event struct {
	EventID    string  `json:"event_id"`
	DeviceID   string  `json:"device_id"`
	Profile    string  `json:"profile"`
	TS         string  `json:"ts"`
	CellID     string  `json:"cell_id"`
	PLMN       string  `json:"plmn"`
	Roaming    bool    `json:"roaming"`
	APN        string  `json:"apn"`
	RSRP       float64 `json:"rsrp"`
	SINR       float64 `json:"sinr"`
	ConnState  string  `json:"conn_state"`
	Cause      string  `json:"cause"`
	Reconnects int     `json:"reconnects"`
	LatencyMs  int     `json:"latency_ms"`
	Battery    float64 `json:"battery_pct"`
	Firmware   string  `json:"firmware"`
	Reset      string  `json:"reset_reason"`
}

func emit(t *testing.T, f *Fleet, i uint32, active []ActiveFault) event {
	t.Helper()
	b, next := f.Emit(nil, i, 10, []byte("2026-10-01T00:00:10"), active)
	if next <= 10 {
		t.Fatalf("next tick %d not in the future", next)
	}
	var e event
	if err := json.Unmarshal(b, &e); err != nil {
		t.Fatalf("invalid JSON %s: %v", b, err)
	}
	return e
}

func TestConfigValidation(t *testing.T) {
	bad := []Config{
		{Devices: 0, Density: 1, IntervalScale: 1, Tenant: "a"},
		{Devices: 1, Density: 0, IntervalScale: 1, Tenant: "a"},
		{Devices: 1, Density: 1, IntervalScale: 0, Tenant: "a"},
		{Devices: 1, Density: 1, IntervalScale: 1, Tenant: "Bad Tenant\""},
	}
	for _, c := range bad {
		if _, err := New(c); err == nil {
			t.Fatalf("expected error for %+v", c)
		}
	}
}

func TestFleetIsDeterministic(t *testing.T) {
	a, b := newFleet(t, 5000), newFleet(t, 5000)
	for i := range uint32(5000) {
		ea, _ := a.Emit(nil, i, 1, []byte("2026-10-01T00:00:01"), nil)
		eb, _ := b.Emit(nil, i, 1, []byte("2026-10-01T00:00:01"), nil)
		if !bytes.Equal(ea, eb) {
			t.Fatalf("device %d differs:\n%s\n%s", i, ea, eb)
		}
	}
}

func TestProfileMixAndRoaming(t *testing.T) {
	f := newFleet(t, 20000)
	counts := map[string]int{}
	roaming := 0
	for i := range uint32(20000) {
		e := emit(t, f, i, nil)
		counts[e.Profile]++
		if e.Roaming {
			roaming++
			if e.PLMN == "310260" {
				t.Fatal("roaming device attached to home PLMN")
			}
		}
	}
	for _, p := range Profiles {
		got := float64(counts[p.Name]) / 20000
		if got < p.Share-0.02 || got > p.Share+0.02 {
			t.Errorf("profile %s share %.3f, want ~%.2f", p.Name, got, p.Share)
		}
	}
	if roaming < 1700 || roaming > 2500 { // 0.25*0.30 + 0.15*0.20 = 10.5%
		t.Errorf("roaming devices %d, want ~2100 +/- noise", roaming)
	}
}

func TestFaultEffects(t *testing.T) {
	f := newFleet(t, 4000)
	// find a home device and a roaming device
	var home, roam uint32 = 1 << 31, 1 << 31
	for i := range uint32(4000) {
		if f.CellPLMN[f.Cell[i]] == 0 && home == 1<<31 {
			home = i
		}
		if f.CellPLMN[f.Cell[i]] != 0 && roam == 1<<31 {
			roam = i
		}
	}
	cases := []struct {
		name  string
		dev   uint32
		fault ActiveFault
		check func(event) bool
	}{
		{"outage", home, ActiveFault{CellOutage, f.Cell[home], 1}, func(e event) bool { return e.ConnState == "no_service" && e.RSRP == -140 }},
		{"congestion", home, ActiveFault{Congestion, f.Cell[home], 1}, func(e event) bool { return e.SINR < 5 }},
		{"storm", home, ActiveFault{ReconnectStorm, f.Cell[home], 1}, func(e event) bool { return e.Reconnects >= 6 }},
		{"roaming", roam, ActiveFault{RoamingMisconfig, uint32(f.CellPLMN[f.Cell[roam]]), 1}, func(e event) bool {
			return e.ConnState == "attach_reject" && (e.Cause == "EMM_15" || e.Cause == "EMM_13")
		}},
		{"apn", home, ActiveFault{APNError, uint32(f.APN[home]), 1}, func(e event) bool { return e.Cause == "ESM_27" }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if !c.check(emit(t, f, c.dev, []ActiveFault{c.fault})) {
				t.Fatalf("fault %s had no effect", c.name)
			}
		})
	}
	t.Run("firmware", func(t *testing.T) {
		resets := 0
		target := uint32(f.FW[home])
		for range 200 {
			if emit(t, f, home, []ActiveFault{{FirmwareRegression, target, 1}}).Reset == "watchdog" {
				resets++
			}
		}
		if resets < 80 || resets > 160 { // p = 0.6
			t.Fatalf("resets %d/200", resets)
		}
	})
	t.Run("untargeted devices unaffected", func(t *testing.T) {
		other := f.Cell[home] + 1
		e := emit(t, f, home, []ActiveFault{{CellOutage, other, 1}})
		if e.RSRP == -140 {
			t.Fatal("outage leaked to another cell")
		}
	})
}

func TestDeviceID(t *testing.T) {
	if got := DeviceID(42); got != "dev-00000042" {
		t.Fatal(got)
	}
	if got := DeviceID(123456789); got != "dev-123456789" {
		t.Fatal(got)
	}
}

func BenchmarkEmit(b *testing.B) {
	f := newFleet(b, 100_000)
	buf := make([]byte, 0, 4096)
	prefix := []byte("2026-10-01T00:00:10")
	b.ReportAllocs()
	b.ResetTimer()
	i := uint32(0)
	for b.Loop() {
		buf, _ = f.Emit(buf[:0], i%100_000, 10, prefix, nil)
		i++
	}
	b.SetBytes(int64(len(buf)))
}
