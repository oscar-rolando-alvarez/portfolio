package fleet

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"

	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/simulator/internal/rng"
)

// Config sizes and seeds a fleet.
type Config struct {
	Devices       int
	Seed          uint64
	Tenant        string
	Density       int     // average devices per cell
	IntervalScale float64 // multiplies every profile's reporting interval
}

var tenantRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,39}$`)

// Validate checks the configuration.
func (c Config) Validate() error {
	switch {
	case c.Devices <= 0 || c.Devices > 50_000_000:
		return fmt.Errorf("devices must be in (0, 50M], got %d", c.Devices)
	case c.Density <= 0:
		return errors.New("density must be > 0")
	case c.IntervalScale <= 0:
		return errors.New("interval scale must be > 0")
	case !tenantRe.MatchString(c.Tenant):
		return fmt.Errorf("tenant %q must match %s", c.Tenant, tenantRe)
	}
	return nil
}

// Fleet is the struct-of-arrays device state. Every slice is indexed by the
// device index; per-device cost is ~22 bytes (see BytesPerDevice).
type Fleet struct {
	Seed   uint64
	Tenant string

	Profile   []uint8
	Cell      []uint32
	FW        []uint8 // index into Firmware
	APN       []uint8 // index into APNs
	RSRPOff   []int8  // static placement offset (dB)
	Battery   []uint16
	Seq       []uint32
	LastReset []uint32 // tick of the last reboot
	Interval  []uint16 // seconds

	// Cell table (also struct-of-arrays).
	CellPLMN []uint8
	CellID   [][]byte // pre-rendered "MCC-MNC-TAC-ECI"

	Firmware []string
	APNs     []string

	profileFW [][]uint8 // per-profile firmware indices
}

// BytesPerDevice is the steady-state memory footprint of one device across
// the per-device arrays (excluding scheduler entries).
const BytesPerDevice = 1 + 4 + 1 + 1 + 1 + 2 + 4 + 4 + 2

// New builds a deterministic fleet.
func New(cfg Config) (*Fleet, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	n := cfg.Devices
	f := &Fleet{
		Seed: cfg.Seed, Tenant: cfg.Tenant,
		Profile: make([]uint8, n), Cell: make([]uint32, n), FW: make([]uint8, n),
		APN: make([]uint8, n), RSRPOff: make([]int8, n), Battery: make([]uint16, n),
		Seq: make([]uint32, n), LastReset: make([]uint32, n), Interval: make([]uint16, n),
	}
	f.profileFW = make([][]uint8, len(Profiles))
	for pi, p := range Profiles {
		f.APNs = append(f.APNs, p.APN)
		for _, v := range p.Firmware {
			f.profileFW[pi] = append(f.profileFW[pi], uint8(len(f.Firmware)))
			f.Firmware = append(f.Firmware, v)
		}
	}

	// Pass 1: profile, PLMN and per-device attributes.
	plmn := make([]uint8, n)
	perPLMN := make([]int, len(PLMNs))
	for i := range n {
		r := rng.New(cfg.Seed, uint64(i), 0xF1EE7)
		pi := pickProfile(r.Float64())
		p := &Profiles[pi]
		f.Profile[i] = uint8(pi)
		f.APN[i] = uint8(pi)
		f.FW[i] = f.profileFW[pi][pickWeighted(p.FirmwareW, r.Float64())]
		f.RSRPOff[i] = int8(r.Norm() * p.RSRPSpread)
		f.Battery[i] = 10000
		if p.Battery {
			f.Battery[i] = uint16(3000 + r.Intn(7000))
		}
		iv := float64(p.IntervalS) * cfg.IntervalScale
		f.Interval[i] = uint16(max(1, min(3600, int(iv))))
		if r.Bool(p.RoamingShare) {
			plmn[i] = uint8(1 + r.Intn(len(PLMNs)-1))
		}
		perPLMN[plmn[i]]++
	}

	// Cell table: each PLMN gets ceil(devices/density) cells.
	firstCell := make([]uint32, len(PLMNs))
	cellsPerPLMN := make([]int, len(PLMNs))
	for pi, cnt := range perPLMN {
		firstCell[pi] = uint32(len(f.CellPLMN))
		c := max(1, (cnt+cfg.Density-1)/cfg.Density)
		cellsPerPLMN[pi] = c
		for k := range c {
			f.CellPLMN = append(f.CellPLMN, uint8(pi))
			pl := PLMNs[pi]
			tac := 1000 + k/64
			id := fmt.Appendf(nil, "%s-%s-%d-%d", pl.MCC, pl.MNC, tac, 100000+k)
			f.CellID = append(f.CellID, id)
		}
	}

	// Pass 2: attach devices to cells.
	for i := range n {
		r := rng.New(cfg.Seed, uint64(i), 0xCE11)
		pi := plmn[i]
		f.Cell[i] = firstCell[pi] + uint32(r.Intn(cellsPerPLMN[pi]))
	}
	return f, nil
}

func pickProfile(u float64) int {
	acc := 0.0
	for i, p := range Profiles {
		acc += p.Share
		if u < acc {
			return i
		}
	}
	return len(Profiles) - 1
}

func pickWeighted(w []float64, u float64) int {
	acc := 0.0
	for i, x := range w {
		acc += x
		if u < acc {
			return i
		}
	}
	return len(w) - 1
}

// Len returns the number of devices.
func (f *Fleet) Len() int { return len(f.Profile) }

// DeviceID renders the stable device identifier.
func DeviceID(i uint32) string { return string(appendDeviceID(nil, i)) }

func appendDeviceID(b []byte, i uint32) []byte {
	b = append(b, "dev-"...)
	var tmp [10]byte
	s := strconv.AppendUint(tmp[:0], uint64(i), 10)
	for range 8 - len(s) {
		b = append(b, '0')
	}
	return append(b, s...)
}

// FirstReport spreads initial reports uniformly over one interval.
func (f *Fleet) FirstReport(i uint32, start uint64) uint64 {
	r := rng.New(f.Seed, uint64(i), 0x5747)
	return start + 1 + uint64(r.Intn(int(f.Interval[i])))
}

var plmnCodes = func() []string {
	out := make([]string, len(PLMNs))
	for i, p := range PLMNs {
		out[i] = p.Code()
	}
	return out
}()

// Connection states and causes on the wire.
const (
	stConnected    = "connected"
	stNoService    = "no_service"
	stAttachReject = "attach_reject"
	stPDNReject    = "pdn_reject"
)

// Emit appends one telemetry event (JSON, no trailing newline) for device i
// at the given tick and returns the extended buffer and the next report tick.
// tsPrefix is the pre-rendered "YYYY-MM-DDTHH:MM:SS" of the tick.
func (f *Fleet) Emit(b []byte, i uint32, tick uint64, tsPrefix []byte, active []ActiveFault) ([]byte, uint64) {
	seq := f.Seq[i]
	f.Seq[i] = seq + 1
	r := rng.New(f.Seed, uint64(i), uint64(seq)+1)
	pi := f.Profile[i]
	p := &Profiles[pi]
	cell := f.Cell[i]
	plmnIdx := f.CellPLMN[cell]
	roaming := plmnIdx != 0

	rsrp := p.RSRPMean + float64(f.RSRPOff[i]) + r.Norm()*2.5
	sinr := p.SINRMean + r.Norm()*2
	latency := p.LatencyMs * (0.75 + 0.5*r.Float64())
	state, cause := stConnected, ""
	reconnects := 0
	if r.Bool(0.03) {
		reconnects = 1
	}
	resetReason := ""
	drain := p.DrainCenti

	// Background noise so baselines have realistic variance.
	switch u := r.Float64(); {
	case u < 0.003:
		state = stNoService
	case u < 0.005:
		state, cause = stPDNReject, "ESM_26" // insufficient resources
	case roaming && u < 0.010:
		state, cause = stAttachReject, "EMM_17" // network failure
	}
	if r.Bool(0.001) {
		resetReason = "power_on"
	}

	for _, af := range active {
		switch af.Kind {
		case CellOutage:
			if cell == af.Target && r.Bool(af.Intensity) {
				state, cause = stNoService, ""
				rsrp, sinr, latency = -140, -20, 0
				reconnects = 0
			}
		case Congestion:
			if cell == af.Target && r.Bool(af.Intensity) {
				sinr -= 11 + r.Float64()*4
				latency *= 6 + r.Float64()*4
				if r.Bool(0.25) {
					state, cause = stAttachReject, "EMM_22" // congestion
				}
				if r.Bool(0.3) {
					reconnects++
				}
			}
		case ReconnectStorm:
			if cell == af.Target && r.Bool(af.Intensity) {
				reconnects = 6 + r.Intn(20)
			}
		case RoamingMisconfig:
			if roaming && uint32(plmnIdx) == af.Target && r.Bool(af.Intensity) {
				state, cause = stAttachReject, "EMM_15" // no suitable cells in tracking area
				if r.Bool(0.3) {
					cause = "EMM_13" // roaming not allowed in this tracking area
				}
				reconnects = 2 + r.Intn(3)
			}
		case APNError:
			if uint32(f.APN[i]) == af.Target && r.Bool(af.Intensity) {
				state, cause = stPDNReject, "ESM_27" // missing or unknown APN
			}
		case FirmwareRegression:
			if uint32(f.FW[i]) == af.Target && r.Bool(af.Intensity*0.6) {
				resetReason = "watchdog"
				reconnects++
				drain += 15
			}
		}
	}
	if resetReason != "" {
		f.LastReset[i] = uint32(tick)
	}
	if p.Battery {
		drain += reconnects * 6
		bat := int(f.Battery[i]) - drain
		if bat < 500 {
			bat = 10000 // battery swapped during a field visit
		}
		f.Battery[i] = uint16(bat)
	}
	if rsrp < -140 {
		rsrp = -140
	}
	rsrq := -10.5 + (sinr-p.SINRMean)*0.35 + r.Norm()*0.8
	rssi := rsrp + 24 + r.Norm()
	payload := p.PayloadMin + r.Intn(p.PayloadMax-p.PayloadMin+1)
	ms := r.Intn(1000)

	b = append(b, `{"v":1,"event_id":"`...)
	b = appendDeviceID(b, i)
	b = append(b, ':')
	b = strconv.AppendUint(b, uint64(seq), 10)
	b = append(b, `","tenant":"`...)
	b = append(b, f.Tenant...)
	b = append(b, `","device_id":"`...)
	b = appendDeviceID(b, i)
	b = append(b, `","profile":"`...)
	b = append(b, p.Name...)
	b = append(b, `","ts":"`...)
	b = append(b, tsPrefix...)
	b = append(b, '.', byte('0'+ms/100), byte('0'+ms/10%10), byte('0'+ms%10), 'Z')
	b = append(b, `","seq":`...)
	b = strconv.AppendUint(b, uint64(seq), 10)
	b = append(b, `,"cell_id":"`...)
	b = append(b, f.CellID[cell]...)
	b = append(b, `","plmn":"`...)
	b = append(b, plmnCodes[plmnIdx]...)
	b = append(b, `","home_plmn":"`...)
	b = append(b, plmnCodes[0]...)
	b = append(b, `","roaming":`...)
	b = strconv.AppendBool(b, roaming)
	b = append(b, `,"rat":"`...)
	b = append(b, p.RAT...)
	b = append(b, `","apn":"`...)
	b = append(b, f.APNs[f.APN[i]]...)
	b = append(b, `","rsrp":`...)
	b = strconv.AppendFloat(b, rsrp, 'f', 1, 64)
	b = append(b, `,"rsrq":`...)
	b = strconv.AppendFloat(b, rsrq, 'f', 1, 64)
	b = append(b, `,"sinr":`...)
	b = strconv.AppendFloat(b, sinr, 'f', 1, 64)
	b = append(b, `,"rssi":`...)
	b = strconv.AppendFloat(b, rssi, 'f', 1, 64)
	b = append(b, `,"conn_state":"`...)
	b = append(b, state...)
	b = append(b, '"')
	if cause != "" {
		b = append(b, `,"cause":"`...)
		b = append(b, cause...)
		b = append(b, '"')
	}
	b = append(b, `,"reconnects":`...)
	b = strconv.AppendInt(b, int64(reconnects), 10)
	b = append(b, `,"latency_ms":`...)
	b = strconv.AppendInt(b, int64(latency), 10)
	b = append(b, `,"battery_pct":`...)
	b = strconv.AppendFloat(b, float64(f.Battery[i])/100, 'f', 2, 64)
	b = append(b, `,"firmware":"`...)
	b = append(b, f.Firmware[f.FW[i]]...)
	b = append(b, '"')
	if resetReason != "" {
		b = append(b, `,"reset_reason":"`...)
		b = append(b, resetReason...)
		b = append(b, '"')
	}
	b = append(b, `,"uptime_s":`...)
	b = strconv.AppendUint(b, tick-uint64(f.LastReset[i]), 10)
	b = append(b, `,"payload_bytes":`...)
	b = strconv.AppendInt(b, int64(payload), 10)
	b = append(b, '}')

	iv := float64(f.Interval[i]) * (0.95 + 0.1*r.Float64())
	return b, tick + uint64(max(1, int(iv+0.5)))
}
