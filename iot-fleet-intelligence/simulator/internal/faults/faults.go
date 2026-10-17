// Package faults parses fault-injection scenarios, resolves their targets
// against a concrete fleet and emits ground-truth labels for evaluation.
package faults

import (
	"cmp"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/simulator/internal/fleet"
)

// Duration is a time.Duration that (un)marshals as "8m" style strings.
type Duration time.Duration

// UnmarshalJSON implements json.Unmarshaler.
func (d *Duration) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return fmt.Errorf("duration must be a string like \"5m\": %w", err)
	}
	v, err := time.ParseDuration(s)
	if err != nil {
		return err
	}
	*d = Duration(v)
	return nil
}

// MarshalJSON implements json.Marshaler.
func (d Duration) MarshalJSON() ([]byte, error) { return json.Marshal(time.Duration(d).String()) }

// Spec is one fault as written by a human.
type Spec struct {
	Type      string   `json:"type"`
	Target    string   `json:"target"` // concrete id or "auto"
	Start     Duration `json:"start"`
	Duration  Duration `json:"duration"`
	Intensity float64  `json:"intensity"`
}

// Scenario is a named, versionable set of faults.
type Scenario struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Faults      []Spec `json:"faults"`
}

// Load reads a scenario file.
func Load(path string) (Scenario, error) {
	data, err := os.ReadFile(path) //nolint:gosec // operator-supplied path
	if err != nil {
		return Scenario{}, err
	}
	var s Scenario
	dec := json.NewDecoder(strings.NewReader(string(data)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&s); err != nil {
		return Scenario{}, fmt.Errorf("parse scenario %s: %w", path, err)
	}
	return s, nil
}

// ParseFlag parses "type:key=value,key=value", e.g.
// "cell_outage:target=auto,start=8m,duration=6m,intensity=0.95".
func ParseFlag(v string) (Spec, error) {
	typ, rest, _ := strings.Cut(v, ":")
	s := Spec{Type: typ, Target: "auto", Intensity: 0.95, Duration: Duration(5 * time.Minute)}
	if rest == "" {
		return s, nil
	}
	for kv := range strings.SplitSeq(rest, ",") {
		k, val, ok := strings.Cut(kv, "=")
		if !ok {
			return s, fmt.Errorf("fault option %q is not key=value", kv)
		}
		switch k {
		case "target":
			s.Target = val
		case "start", "duration":
			d, err := time.ParseDuration(val)
			if err != nil {
				return s, fmt.Errorf("fault %s: %w", k, err)
			}
			if k == "start" {
				s.Start = Duration(d)
			} else {
				s.Duration = Duration(d)
			}
		case "intensity":
			f, err := strconv.ParseFloat(val, 64)
			if err != nil {
				return s, fmt.Errorf("fault intensity: %w", err)
			}
			s.Intensity = f
		default:
			return s, fmt.Errorf("unknown fault option %q", k)
		}
	}
	return s, nil
}

// Resolved is a fault bound to a fleet index and a tick window [Start, End).
type Resolved struct {
	Kind      fleet.FaultKind
	Target    uint32
	Start     uint64
	End       uint64
	Intensity float64
	Scope     string
	Affected  int
}

// Resolve validates specs and binds "auto" targets deterministically.
func Resolve(specs []Spec, f *fleet.Fleet) ([]Resolved, error) {
	out := make([]Resolved, 0, len(specs))
	usedCells := map[uint32]bool{}
	for _, s := range specs {
		kind, ok := fleet.ParseFaultKind(s.Type)
		if !ok {
			return nil, fmt.Errorf("unknown fault type %q", s.Type)
		}
		if s.Intensity <= 0 || s.Intensity > 1 {
			return nil, fmt.Errorf("fault %s: intensity must be in (0, 1]", s.Type)
		}
		if s.Duration <= 0 || s.Start < 0 {
			return nil, fmt.Errorf("fault %s: start must be >= 0 and duration > 0", s.Type)
		}
		target, scope, err := resolveTarget(kind, s.Target, f, usedCells)
		if err != nil {
			return nil, fmt.Errorf("fault %s: %w", s.Type, err)
		}
		start := uint64(time.Duration(s.Start) / time.Second)
		end := start + uint64(time.Duration(s.Duration)/time.Second)
		out = append(out, Resolved{
			Kind: kind, Target: target, Start: start, End: end, Intensity: s.Intensity,
			Scope: scope, Affected: affected(kind, target, f),
		})
	}
	return out, nil
}

func resolveTarget(kind fleet.FaultKind, target string, f *fleet.Fleet, usedCells map[uint32]bool) (uint32, string, error) {
	switch kind.ScopeType() {
	case "cell":
		if target == "auto" {
			idx, err := busiestHomeCell(f, usedCells)
			if err != nil {
				return 0, "", err
			}
			usedCells[idx] = true
			return idx, string(f.CellID[idx]), nil
		}
		for i, id := range f.CellID {
			if string(id) == target {
				return uint32(i), target, nil
			}
		}
	case "plmn":
		if target == "auto" {
			counts := make([]int, len(fleet.PLMNs))
			for _, c := range f.Cell {
				counts[f.CellPLMN[c]]++
			}
			best := 1
			for i := 2; i < len(counts); i++ {
				if counts[i] > counts[best] {
					best = i
				}
			}
			return uint32(best), fleet.PLMNs[best].Code(), nil
		}
		for i := 1; i < len(fleet.PLMNs); i++ {
			if fleet.PLMNs[i].Code() == target {
				return uint32(i), target, nil
			}
		}
	case "apn":
		if target == "auto" {
			target = f.APNs[1] // trackers: the APN most often re-provisioned
		}
		if i := slices.Index(f.APNs, target); i >= 0 {
			return uint32(i), target, nil
		}
	case "firmware":
		if target == "auto" {
			target = "MTR-3.3.1" // the newest smart-meter build, i.e. the rollout in progress
		}
		if i := slices.Index(f.Firmware, target); i >= 0 {
			return uint32(i), target, nil
		}
	}
	return 0, "", fmt.Errorf("target %q not found in fleet", target)
}

func busiestHomeCell(f *fleet.Fleet, used map[uint32]bool) (uint32, error) {
	counts := make([]int, len(f.CellID))
	for _, c := range f.Cell {
		counts[c]++
	}
	best, bestN := -1, -1
	for i, n := range counts {
		if f.CellPLMN[i] == 0 && !used[uint32(i)] && n > bestN {
			best, bestN = i, n
		}
	}
	if best < 0 {
		return 0, errors.New("no home cell available")
	}
	return uint32(best), nil
}

func affected(kind fleet.FaultKind, target uint32, f *fleet.Fleet) int {
	n := 0
	for i := range f.Len() {
		var hit bool
		switch kind.ScopeType() {
		case "cell":
			hit = f.Cell[i] == target
		case "plmn":
			hit = uint32(f.CellPLMN[f.Cell[i]]) == target
		case "apn":
			hit = uint32(f.APN[i]) == target
		case "firmware":
			hit = uint32(f.FW[i]) == target
		}
		if hit {
			n++
		}
	}
	return n
}

// Active appends the faults in effect at tick to dst.
func Active(rs []Resolved, tick uint64, dst []fleet.ActiveFault) []fleet.ActiveFault {
	dst = dst[:0]
	for _, r := range rs {
		if tick >= r.Start && tick < r.End {
			dst = append(dst, fleet.ActiveFault{Kind: r.Kind, Target: r.Target, Intensity: r.Intensity})
		}
	}
	return dst
}

// Label is the ground truth for one injected fault.
type Label struct {
	FaultType       string `json:"fault_type"`
	ScopeType       string `json:"scope_type"`
	Scope           string `json:"scope"`
	Start           string `json:"start"`
	End             string `json:"end"`
	AffectedDevices int    `json:"affected_devices"`
}

// Manifest is written next to simulated telemetry so evaluations can score
// detections against what was really injected.
type Manifest struct {
	Scenario string  `json:"scenario"`
	Seed     uint64  `json:"seed"`
	Tenant   string  `json:"tenant"`
	Devices  int     `json:"devices"`
	Start    string  `json:"start"`
	End      string  `json:"end"`
	Faults   []Label `json:"faults"`
}

// BuildManifest renders labels with wall-clock timestamps.
func BuildManifest(name string, seed uint64, tenant string, devices int, start time.Time, dur time.Duration, rs []Resolved) Manifest {
	m := Manifest{
		Scenario: name, Seed: seed, Tenant: tenant, Devices: devices,
		Start: start.UTC().Format(time.RFC3339), End: start.Add(dur).UTC().Format(time.RFC3339),
		Faults: []Label{},
	}
	for _, r := range rs {
		m.Faults = append(m.Faults, Label{
			FaultType: r.Kind.String(), ScopeType: r.Kind.ScopeType(), Scope: r.Scope,
			Start:           start.Add(time.Duration(r.Start) * time.Second).UTC().Format(time.RFC3339),
			End:             start.Add(time.Duration(r.End) * time.Second).UTC().Format(time.RFC3339),
			AffectedDevices: r.Affected,
		})
	}
	slices.SortStableFunc(m.Faults, func(a, b Label) int { return cmp.Compare(a.Start, b.Start) })
	return m
}
