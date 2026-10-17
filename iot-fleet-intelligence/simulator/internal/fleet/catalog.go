// Package fleet holds the compact, struct-of-arrays state of a simulated
// device fleet and the per-event telemetry generator.
package fleet

// Profile describes a device archetype and its "healthy" telemetry envelope.
type Profile struct {
	Name         string
	Share        float64 // fraction of the fleet
	IntervalS    int     // nominal reporting interval in seconds
	RAT          string  // radio access technology
	RSRPMean     float64 // dBm
	RSRPSpread   float64 // per-device placement spread (dB)
	SINRMean     float64 // dB
	LatencyMs    float64 // median uplink round trip
	PayloadMin   int     // bytes
	PayloadMax   int     // bytes
	Battery      bool    // battery powered (false = mains/vehicle powered)
	DrainCenti   int     // battery drain per report, in 1/100 of a percent
	RoamingShare float64 // share of devices attached to a visited network
	APN          string
	Firmware     []string
	FirmwareW    []float64 // rollout weights, sum to 1
}

// Profiles is the catalogue of simulated device archetypes.
var Profiles = []Profile{
	{
		Name: "smart_meter", Share: 0.40, IntervalS: 300, RAT: "NB-IoT",
		RSRPMean: -104, RSRPSpread: 8, SINRMean: 6, LatencyMs: 1600,
		PayloadMin: 96, PayloadMax: 160, Battery: true, DrainCenti: 1,
		APN: "meter.fleet.iot", Firmware: []string{"MTR-3.2.0", "MTR-3.3.1"}, FirmwareW: []float64{0.7, 0.3},
	},
	{
		Name: "asset_tracker", Share: 0.25, IntervalS: 60, RAT: "LTE-M",
		RSRPMean: -96, RSRPSpread: 10, SINRMean: 9, LatencyMs: 220,
		PayloadMin: 64, PayloadMax: 128, Battery: true, DrainCenti: 2, RoamingShare: 0.30,
		APN: "track.fleet.iot", Firmware: []string{"TRK-1.8.4", "TRK-1.9.0"}, FirmwareW: []float64{0.6, 0.4},
	},
	{
		Name: "vehicle_telematics", Share: 0.15, IntervalS: 30, RAT: "LTE",
		RSRPMean: -88, RSRPSpread: 8, SINRMean: 13, LatencyMs: 60,
		PayloadMin: 512, PayloadMax: 1024, RoamingShare: 0.20,
		APN: "telematics.fleet.iot", Firmware: []string{"VTU-5.0.2", "VTU-5.1.0"}, FirmwareW: []float64{0.8, 0.2},
	},
	{
		Name: "industrial_sensor", Share: 0.20, IntervalS: 60, RAT: "LTE-M",
		RSRPMean: -92, RSRPSpread: 6, SINRMean: 10, LatencyMs: 180,
		PayloadMin: 128, PayloadMax: 256,
		APN: "industrial.fleet.iot", Firmware: []string{"IND-2.1.7"}, FirmwareW: []float64{1},
	},
}

// PLMN is a mobile network (MCC+MNC).
type PLMN struct {
	MCC, MNC string
}

// Code returns the compact MCCMNC code.
func (p PLMN) Code() string { return p.MCC + p.MNC }

// PLMNs lists the simulated networks: index 0 is the home network, the rest are roaming partners.
var PLMNs = []PLMN{
	{"310", "260"}, // home network
	{"262", "01"},
	{"234", "15"},
	{"208", "01"},
	{"222", "10"},
}

// FaultKind enumerates the injectable fault scenarios.
type FaultKind uint8

// Fault kinds. Their string names are the wire contract with the detection
// pipeline and the evaluation harness.
const (
	CellOutage FaultKind = iota + 1
	Congestion
	ReconnectStorm
	RoamingMisconfig
	APNError
	FirmwareRegression
)

var faultNames = map[FaultKind]string{
	CellOutage:         "cell_outage",
	Congestion:         "congestion",
	ReconnectStorm:     "reconnect_storm",
	RoamingMisconfig:   "roaming_misconfig",
	APNError:           "apn_error",
	FirmwareRegression: "firmware_regression",
}

func (k FaultKind) String() string { return faultNames[k] }

// ScopeType is the dimension a fault kind is attached to.
func (k FaultKind) ScopeType() string {
	switch k {
	case CellOutage, Congestion, ReconnectStorm:
		return "cell"
	case RoamingMisconfig:
		return "plmn"
	case APNError:
		return "apn"
	case FirmwareRegression:
		return "firmware"
	}
	return ""
}

// ParseFaultKind maps a wire name back to its kind.
func ParseFaultKind(s string) (FaultKind, bool) {
	for k, n := range faultNames {
		if n == s {
			return k, true
		}
	}
	return 0, false
}

// ActiveFault is a fault in effect at the current tick.
type ActiveFault struct {
	Kind      FaultKind
	Target    uint32 // cell, PLMN, APN or firmware index depending on Kind
	Intensity float64
}
