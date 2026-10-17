---
id: RB-CELL-001
title: Cell site outage (no service in one cell)
fault_types: cell_outage
---
## Symptoms
A large share of devices attached to one cell report `no_service` at the same time, RSRP collapses to the
floor (-140 dBm) and uplink traffic from the cell drops to zero. Neighbouring cells remain healthy, which
separates a site outage from a core-network or APN problem. Devices typically report the gap later through
store-and-forward, so the incident window is reconstructed from buffered events.

## Triage
1. Confirm the blast radius is limited to one cell id (or one eNodeB / gNodeB sector group).
2. Check the radio access network alarm console for the site: power, backhaul (microwave/fibre), and
   baseband alarms. A simultaneous backhaul alarm points to transport rather than radio.
3. Correlate with weather: wind gusts above 75 km/h, lightning or flooding at the site location increase
   the prior for physical damage or power loss.
4. Check the operator status feed for planned maintenance on the tracking area.

## Remediation
- Open a priority ticket with the RAN operations centre for the site, attaching the cell id and the time
  the first devices dropped.
- If the site is in planned maintenance, suppress downstream alerts until the window closes.
- For critical assets (meters feeding billing, safety sensors), enable fallback: allow devices to select
  neighbour cells by relaxing cell-reselection barring, or switch to the secondary network on multi-IMSI SIMs.
- Do not dispatch field service to the devices themselves: the devices are healthy.

## Truck roll criteria
A truck roll to the devices is NOT required for a cell outage. A site visit by the network operator is
required only when remote power or backhaul recovery fails.

## Customer communication
"We detected a temporary network outage affecting devices in one coverage area. Devices will reconnect
automatically and upload buffered readings once service is restored; no action is required on your side."
