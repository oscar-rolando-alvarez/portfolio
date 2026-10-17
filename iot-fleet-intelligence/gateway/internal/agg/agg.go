package agg

import (
	"cmp"
	"math"
	"slices"
	"sync"
	"time"
)

// Config tunes an Aggregator. Zero values fall back to the defaults below.
type Config struct {
	Window       int           // seconds of the sliding window for per-scope stats (default 30)
	OnlineTTL    time.Duration // a device is online if it reported "connected" within this TTL (default 2m)
	History      int           // seconds of compact history kept for late joiners (default 900 = 15 min)
	TopN         int           // rows per top-degraded list (default 8)
	MinEvents    int           // events in the window before a scope is ranked or scored (default 8)
	SampleBudget int           // max events per second fed into distributions - ingest downsampling (default 20000)
	CellsEvery   int           // emit the full cell frame every N ticks (default 2)
	IdleEvict    time.Duration // forget scopes idle for this long (default 10m)
	Clock        func() time.Time
}

func (c Config) withDefaults() Config {
	def := func(v *int, d int) {
		if *v <= 0 {
			*v = d
		}
	}
	def(&c.Window, 30)
	def(&c.History, 900)
	def(&c.TopN, 8)
	def(&c.MinEvents, 8)
	def(&c.SampleBudget, 20_000)
	def(&c.CellsEvery, 2)
	if c.OnlineTTL <= 0 {
		c.OnlineTTL = 2 * time.Minute
	}
	if c.IdleEvict <= 0 {
		c.IdleEvict = 10 * time.Minute
	}
	if c.Clock == nil {
		c.Clock = time.Now
	}
	return c
}

// Histogram bins (dB / dBm). RSRP: -140..-44 in 4 dB bins; SINR: -20..30 in 2 dB bins.
var (
	rsrpEdges = edges(-140, -44, 4)
	sinrEdges = edges(-20, 30, 2)
)

func edges(lo, hi, step float64) []float64 {
	var out []float64
	for v := lo; v <= hi; v += step {
		out = append(out, v)
	}
	return out
}

func bin(e []float64, v float64) int {
	if v <= e[0] {
		return 0
	}
	i := int((v - e[0]) / (e[1] - e[0]))
	return min(i, len(e)-2)
}

type bucket struct {
	sec          int64
	events       int
	notConnected int
	attachReject int
	pdnReject    int
	resets       int
	reconnects   int
	sinrSum      float64
}

type ewma struct {
	mean, variance float64
	n              int
}

const warmup = 5 // baseline samples before a scope can be scored

func (e *ewma) update(x, alpha float64) {
	if e.n == 0 {
		e.mean, e.n = x, 1
		return
	}
	d := x - e.mean
	e.mean += alpha * d
	e.variance = (1 - alpha) * (e.variance + alpha*d*d)
	e.n++
}

func (e *ewma) z(x, floor float64) float64 {
	if e.n < warmup {
		return 0
	}
	return (x - e.mean) / math.Max(math.Sqrt(e.variance), floor)
}

type scope struct {
	kind    string // cell | plmn | apn | firmware
	key     string
	ring    []bucket
	base    [3]ewma
	last    int64
	onsetMs int64 // start of the current anomaly episode (0 = none)
	lastMs  int64 // start of the most recent episode, kept after recovery for MTTD
	stat    DimStat
	fault   string
	z       float64
}

func (s *scope) slot(sec int64) *bucket {
	b := &s.ring[int(sec%int64(len(s.ring)))]
	if b.sec != sec {
		*b = bucket{sec: sec}
	}
	return b
}

func (s *scope) sum(now int64) bucket {
	var t bucket
	for i := range s.ring {
		b := &s.ring[i]
		if b.sec > now-int64(len(s.ring)) && b.sec <= now {
			t.events += b.events
			t.notConnected += b.notConnected
			t.attachReject += b.attachReject
			t.pdnReject += b.pdnReject
			t.resets += b.resets
			t.reconnects += b.reconnects
			t.sinrSum += b.sinrSum
		}
	}
	return t
}

type device struct {
	last      int64
	cell      string
	connected bool
}

type second struct {
	events, bytes, connected, noService, attachReject, pdnReject, resets, sampled int
	latencySum                                                                    int64
	rsrp, sinr                                                                    []int
	rat                                                                           map[string]int
}

func newSecond() second {
	return second{rsrp: make([]int, len(rsrpEdges)-1), sinr: make([]int, len(sinrEdges)-1), rat: map[string]int{}}
}

// Aggregator is safe for concurrent Add (consumer) and Tick (1 Hz clock).
type Aggregator struct {
	mu       sync.Mutex
	cfg      Config
	cur      second
	lastTick time.Time
	devices  map[string]*device
	scopes   map[string]map[string]*scope // kind -> key -> scope
	history  []Point
	latest   *Snapshot
	cells    *CellFrame
	seq      uint64
}

// New builds an Aggregator.
func New(cfg Config) *Aggregator {
	cfg = cfg.withDefaults()
	return &Aggregator{
		cfg:      cfg,
		cur:      newSecond(),
		lastTick: cfg.Clock(),
		devices:  map[string]*device{},
		scopes: map[string]map[string]*scope{
			"cell": {}, "plmn": {}, "apn": {}, "firmware": {},
		},
	}
}

func (a *Aggregator) scope(kind, key string) *scope {
	m := a.scopes[kind]
	s, ok := m[key]
	if !ok {
		s = &scope{kind: kind, key: key, ring: make([]bucket, a.cfg.Window)}
		m[key] = s
	}
	return s
}

// Add folds one decoded event (size = encoded bytes) into the current second.
func (a *Aggregator) Add(ev *Event, size int) {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := a.cfg.Clock().Unix()
	c := &a.cur
	c.events++
	c.bytes += size
	connected := ev.ConnState == "connected"
	switch ev.ConnState {
	case "connected":
		c.connected++
	case "no_service":
		c.noService++
	case "attach_reject":
		c.attachReject++
	case "pdn_reject":
		c.pdnReject++
	}
	reset := ev.ResetReason != "" && ev.ResetReason != "power_on"
	if reset {
		c.resets++
	}
	// Downsampling: distributions only need a statistically large sample.
	if c.sampled < a.cfg.SampleBudget {
		c.sampled++
		if connected {
			c.rsrp[bin(rsrpEdges, ev.RSRP)]++
			c.sinr[bin(sinrEdges, ev.SINR)]++
			c.latencySum += int64(ev.LatencyMs)
		}
		c.rat[ev.RAT]++
	}
	d := a.devices[ev.DeviceID]
	if d == nil {
		d = &device{}
		a.devices[ev.DeviceID] = d
	}
	d.last, d.cell, d.connected = now, ev.CellID, connected

	add := func(kind, key string) {
		if key == "" {
			return
		}
		s := a.scope(kind, key)
		s.last = now
		b := s.slot(now)
		b.events++
		if !connected {
			b.notConnected++
		}
		switch ev.ConnState {
		case "attach_reject":
			b.attachReject++
		case "pdn_reject":
			b.pdnReject++
		}
		if reset {
			b.resets++
		}
		b.reconnects += ev.Reconnects
		b.sinrSum += ev.SINR
	}
	add("cell", ev.CellID)
	add("firmware", ev.Firmware)
	add("apn", ev.APN)
	if ev.Roaming {
		add("plmn", ev.PLMN)
	}
}

// rule maps a scope kind to (metric extractor, z floor, fault name) triples.
// Index i of each list matches scope.base[i].
type metric struct {
	value func(b bucket) float64
	floor float64
	fault string
	sign  float64 // +1: higher is worse, -1: lower is worse
}

var rules = map[string][]metric{
	"cell": {
		{func(b bucket) float64 { return ratio(b.notConnected, b.events) }, 0.03, "cell_outage", 1},
		{func(b bucket) float64 { return b.sinrSum / float64(max(b.events, 1)) }, 1.5, "congestion", -1},
		{func(b bucket) float64 { return ratio(b.reconnects, b.events) }, 0.15, "reconnect_storm", 1},
	},
	"plmn":     {{func(b bucket) float64 { return ratio(b.attachReject, b.events) }, 0.03, "roaming_misconfig", 1}},
	"apn":      {{func(b bucket) float64 { return ratio(b.pdnReject, b.events) }, 0.03, "apn_error", 1}},
	"firmware": {{func(b bucket) float64 { return ratio(b.resets, b.events) }, 0.02, "firmware_regression", 1}},
}

func ratio(n, d int) float64 {
	if d == 0 {
		return 0
	}
	return float64(n) / float64(d)
}

func round(x float64, p float64) float64 { return math.Round(x*p) / p }

// score maps a z-score to 0..1: nothing below z=3, saturates at z=10.
func score(z float64) float64 { return math.Min(1, math.Max(0, (z-3)/7)) }

func (a *Aggregator) evaluate(s *scope, now int64, nowMs int64) {
	t := s.sum(now)
	st := DimStat{
		Key:                s.key,
		Events:             t.events,
		FailRatio:          round(ratio(t.notConnected, t.events), 1e4),
		ResetRatio:         round(ratio(t.resets, t.events), 1e4),
		ReconnectsPerEvent: round(ratio(t.reconnects, t.events), 1e3),
		SINR:               round(t.sinrSum/float64(max(t.events, 1)), 10),
	}
	switch s.kind {
	case "plmn":
		st.FailRatio = round(ratio(t.attachReject, t.events), 1e4)
	case "apn":
		st.FailRatio = round(ratio(t.pdnReject, t.events), 1e4)
	}
	s.z, s.fault = 0, ""
	if t.events >= a.cfg.MinEvents {
		for i, m := range rules[s.kind] {
			v := m.value(t)
			z := m.sign * s.base[i].z(v, m.floor)
			if z > s.z {
				s.z, s.fault = z, m.fault
			}
		}
		if s.z < 3 { // learn only from normal behaviour, so faults do not poison baselines
			for i, m := range rules[s.kind] {
				s.base[i].update(m.value(t), 0.05)
			}
		}
	}
	st.Anomaly = round(score(s.z), 1e3)
	st.Health = round(math.Max(0, math.Min(1, 1-st.FailRatio-0.5*st.Anomaly)), 1e3)
	if st.Anomaly >= 0.3 && s.onsetMs == 0 {
		s.onsetMs, s.lastMs = nowMs, nowMs
	} else if st.Anomaly < 0.1 {
		s.onsetMs = 0
	}
	s.stat = st
}

// Tick closes the current second and returns its snapshot, plus a full cell
// frame every CellsEvery ticks (nil otherwise).
func (a *Aggregator) Tick() (Snapshot, *CellFrame) {
	a.mu.Lock()
	defer a.mu.Unlock()
	nowT := a.cfg.Clock()
	now, nowMs := nowT.Unix(), nowT.UnixMilli()
	elapsed := nowT.Sub(a.lastTick).Seconds()
	if elapsed <= 0 {
		elapsed = 1
	}
	a.lastTick = nowT
	c := a.cur
	a.cur = newSecond()
	a.seq++

	evict := now - int64(a.cfg.IdleEvict/time.Second)
	var anomalies []Anomaly
	var windowEvents, windowConnected int
	lists := map[string][]DimStat{}
	for kind, m := range a.scopes {
		for key, s := range m {
			if s.last < evict {
				delete(m, key)
				continue
			}
			a.evaluate(s, now, nowMs)
			if kind == "cell" {
				windowEvents += s.stat.Events
				windowConnected += s.stat.Events - int(math.Round(s.stat.FailRatio*float64(s.stat.Events)))
			}
			if s.stat.Events >= a.cfg.MinEvents {
				lists[kind] = append(lists[kind], s.stat)
			}
			if s.stat.Anomaly >= 0.3 {
				anomalies = append(anomalies, Anomaly{
					ScopeType: kind, Scope: key, Kind: s.fault, Score: s.stat.Anomaly,
					Z: round(s.z, 100), OnsetMs: s.onsetMs,
				})
			}
		}
	}
	slices.SortFunc(anomalies, func(x, y Anomaly) int {
		return cmp.Or(cmp.Compare(y.Score, x.Score), cmp.Compare(x.Scope, y.Scope))
	})
	if len(anomalies) > 20 {
		anomalies = anomalies[:20]
	}

	ttl := int64(a.cfg.OnlineTTL / time.Second)
	online := 0
	cellOnline := map[string]int{}
	for id, d := range a.devices {
		if now-d.last > ttl {
			delete(a.devices, id)
			continue
		}
		if d.connected {
			online++
			cellOnline[d.cell]++
		}
	}

	snap := Snapshot{
		Seq: a.seq, TS: nowMs,
		EventsPerSec:  int(math.Round(float64(c.events) / elapsed)),
		BytesPerSec:   int(math.Round(float64(c.bytes) / elapsed)),
		DevicesOnline: online, DevicesSeen: len(a.devices),
		Availability: 1,
		Connected:    c.connected, NoService: c.noService, AttachReject: c.attachReject,
		PDNReject: c.pdnReject, Resets: c.resets,
		RSRP:          Histogram{Edges: rsrpEdges, Counts: c.rsrp},
		SINR:          Histogram{Edges: sinrEdges, Counts: c.sinr},
		RATMix:        c.rat,
		Anomalies:     anomalies,
		TopCells:      a.top(lists["cell"]),
		TopFirmware:   a.top(lists["firmware"]),
		TopCarriers:   a.top(lists["plmn"]),
		TopAPNs:       a.top(lists["apn"]),
		SampledEvents: c.sampled,
	}
	if windowEvents > 0 {
		snap.Availability = round(float64(windowConnected)/float64(windowEvents), 1e4)
	}
	if c.connected > 0 {
		snap.LatencyMs = round(float64(c.latencySum)/float64(min(c.connected, c.sampled)), 10)
	}
	if snap.Anomalies == nil {
		snap.Anomalies = []Anomaly{}
	}
	for _, an := range anomalies {
		snap.AnomalyScore = math.Max(snap.AnomalyScore, an.Score)
	}
	a.latest = &snap
	a.history = append(a.history, Point{
		TS: nowMs, EventsPerSec: snap.EventsPerSec, DevicesOnline: online,
		Availability: snap.Availability, AnomalyScore: snap.AnomalyScore,
	})
	if over := len(a.history) - a.cfg.History; over > 0 {
		a.history = slices.Delete(a.history, 0, over)
	}

	var frame *CellFrame
	if a.seq%uint64(a.cfg.CellsEvery) == 1 || a.cfg.CellsEvery == 1 {
		frame = a.cellFrame(nowMs, cellOnline)
		a.cells = frame
	}
	return snap, frame
}

// top returns the worst scopes: anomaly first, then failure ratio, then volume.
func (a *Aggregator) top(in []DimStat) []DimStat {
	slices.SortFunc(in, func(x, y DimStat) int {
		return cmp.Or(
			cmp.Compare(y.Anomaly, x.Anomaly),
			cmp.Compare(y.FailRatio+y.ResetRatio, x.FailRatio+x.ResetRatio),
			cmp.Compare(y.Events, x.Events),
			cmp.Compare(x.Key, y.Key),
		)
	})
	if len(in) > a.cfg.TopN {
		in = in[:a.cfg.TopN]
	}
	if in == nil {
		return []DimStat{}
	}
	return in
}

func (a *Aggregator) cellFrame(nowMs int64, online map[string]int) *CellFrame {
	m := a.scopes["cell"]
	keys := make([]string, 0, len(m))
	for k, s := range m {
		if s.stat.Events > 0 {
			keys = append(keys, k)
		}
	}
	slices.Sort(keys)
	f := &CellFrame{
		TS: nowMs, IDs: keys, Health: make([]int, len(keys)), Anomaly: make([]int, len(keys)),
		Events: make([]int, len(keys)), Online: make([]int, len(keys)),
	}
	for i, k := range keys {
		st := m[k].stat
		f.Health[i] = int(math.Round(st.Health * 100))
		f.Anomaly[i] = int(math.Round(st.Anomaly * 100))
		f.Events[i] = st.Events
		f.Online[i] = online[k]
	}
	return f
}

// State returns what a late-joining client needs: history, last snapshot and cell frame.
func (a *Aggregator) State() (history []Point, latest *Snapshot, cells *CellFrame) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return slices.Clone(a.history), a.latest, a.cells
}

// Onset returns when the gateway last started flagging scope (unix ms), or 0.
func (a *Aggregator) Onset(kind, key string) int64 {
	a.mu.Lock()
	defer a.mu.Unlock()
	if s, ok := a.scopes[kind][key]; ok {
		return s.lastMs
	}
	return 0
}
