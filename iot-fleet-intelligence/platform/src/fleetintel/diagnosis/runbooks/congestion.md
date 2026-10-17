---
id: RB-CONG-001
title: Radio congestion in a cell
fault_types: congestion
---
## Symptoms
SINR drops by 10 dB or more across most devices in a cell while RSRP stays normal: the signal is strong but
noisy because the cell is overloaded or interfered. Latency increases several-fold and some attach attempts
are rejected with EMM cause #22 (congestion). Devices stay in service, unlike a site outage.

## Triage
1. Check the cell's PRB (physical resource block) utilisation and RRC connected users in the RAN
   performance counters. Utilisation above 85% confirms load congestion.
2. Look for an event driving load: stadium/venue events, rush hour on a highway, or a firmware fleet that
   synchronised its reporting schedule (all devices waking at the top of the hour).
3. If utilisation is normal, suspect external interference and request a spectrum scan.

## Remediation
- Ask the operator to rebalance load (cell reselection offsets, carrier aggregation, adding a carrier).
- Spread device reporting with randomised jitter and exponential back-off so the fleet does not
  synchronise. Push a configuration change rather than a firmware update when possible.
- For NB-IoT/LTE-M fleets enable PSM/eDRX so idle devices release radio resources faster.

## Truck roll criteria
No truck roll. Congestion is remediated remotely by the network operator or by device configuration.

## Customer communication
"Some devices are experiencing slower connections because the local network is busy. Data is not lost and
we are working with the network operator to restore normal performance."
