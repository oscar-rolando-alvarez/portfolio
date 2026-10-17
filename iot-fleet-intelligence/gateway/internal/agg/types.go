// Package agg turns a high-rate telemetry stream into compact per-second
// frames for operators: throughput, availability, signal-quality
// distributions, per-cell health and anomaly scores, and top-degraded lists.
//
// The wire types in this file are the contract with the dashboard
// (dashboard/src/lib/stream/types.ts). Field names are camelCase JSON.
package agg

// Event is the subset of the simulator's telemetry schema (v1) the gateway
// needs. Unknown fields are ignored by encoding/json.
type Event struct {
	Tenant       string  `json:"tenant"`
	DeviceID     string  `json:"device_id"`
	Profile      string  `json:"profile"`
	CellID       string  `json:"cell_id"`
	PLMN         string  `json:"plmn"`
	Roaming      bool    `json:"roaming"`
	RAT          string  `json:"rat"`
	APN          string  `json:"apn"`
	RSRP         float64 `json:"rsrp"`
	SINR         float64 `json:"sinr"`
	ConnState    string  `json:"conn_state"`
	Cause        string  `json:"cause"`
	Reconnects   int     `json:"reconnects"`
	LatencyMs    int     `json:"latency_ms"`
	Firmware     string  `json:"firmware"`
	ResetReason  string  `json:"reset_reason"`
	PayloadBytes int     `json:"payload_bytes"`
}

// Histogram is a fixed-bin distribution; Edges has len(Counts)+1 entries.
type Histogram struct {
	Edges  []float64 `json:"edges"`
	Counts []int     `json:"counts"`
}

// DimStat ranks one value of a dimension (cell, firmware, visited network, APN).
type DimStat struct {
	Key                string  `json:"key"`
	Events             int     `json:"events"`
	FailRatio          float64 `json:"failRatio"`
	ResetRatio         float64 `json:"resetRatio"`
	ReconnectsPerEvent float64 `json:"reconnectsPerEvent"`
	SINR               float64 `json:"sinr"`
	Health             float64 `json:"health"`
	Anomaly            float64 `json:"anomaly"`
}

// Anomaly is a live signal raised by the gateway before the platform has
// confirmed an incident. Kind uses the platform's fault vocabulary.
type Anomaly struct {
	ScopeType string  `json:"scopeType"` // cell | plmn | apn | firmware
	Scope     string  `json:"scope"`
	Kind      string  `json:"kind"`
	Score     float64 `json:"score"` // 0..1
	Z         float64 `json:"z"`
	OnsetMs   int64   `json:"onsetMs"`
}

// Snapshot is one second of fleet state (SSE event "snapshot").
type Snapshot struct {
	Seq           uint64         `json:"seq"`
	TS            int64          `json:"ts"` // unix ms (wall clock of the gateway)
	EventsPerSec  int            `json:"eventsPerSec"`
	BytesPerSec   int            `json:"bytesPerSec"`
	DevicesOnline int            `json:"devicesOnline"`
	DevicesSeen   int            `json:"devicesSeen"`
	Availability  float64        `json:"availability"` // connected share of events in the cell window
	Connected     int            `json:"connected"`
	NoService     int            `json:"noService"`
	AttachReject  int            `json:"attachReject"`
	PDNReject     int            `json:"pdnReject"`
	Resets        int            `json:"resets"`
	LatencyMs     float64        `json:"latencyMs"`
	RSRP          Histogram      `json:"rsrp"`
	SINR          Histogram      `json:"sinr"`
	RATMix        map[string]int `json:"ratMix"`
	AnomalyScore  float64        `json:"anomalyScore"`
	Anomalies     []Anomaly      `json:"anomalies"`
	TopCells      []DimStat      `json:"topCells"`
	TopFirmware   []DimStat      `json:"topFirmware"`
	TopCarriers   []DimStat      `json:"topCarriers"`
	TopAPNs       []DimStat      `json:"topApns"`
	SampledEvents int            `json:"sampledEvents"` // events that fed the distributions this second
}

// CellFrame carries every active cell in compact columnar form (SSE event "cells").
type CellFrame struct {
	TS      int64    `json:"ts"`
	IDs     []string `json:"ids"`
	Health  []int    `json:"health"`  // 0..100
	Anomaly []int    `json:"anomaly"` // 0..100
	Events  []int    `json:"events"`  // events in the window
	Online  []int    `json:"online"`  // devices online on the cell
}

// Point is the compact history sample sent in the SSE "hello" event.
type Point struct {
	TS            int64   `json:"ts"`
	EventsPerSec  int     `json:"eventsPerSec"`
	DevicesOnline int     `json:"devicesOnline"`
	Availability  float64 `json:"availability"`
	AnomalyScore  float64 `json:"anomalyScore"`
}
