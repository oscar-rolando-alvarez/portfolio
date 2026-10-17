---
id: RB-STORM-001
title: Reconnect storm and battery drain
fault_types: reconnect_storm
---
## Symptoms
Devices in a cell report many reconnects per reporting interval (5 to 25) while radio quality and service
are normal. Battery level drops much faster than the profile's nominal drain, which shortens field life of
battery-powered meters and trackers and eventually causes truck rolls for battery replacement.

## Triage
1. Verify that RSRP/SINR are normal and attach rejects are low: the network is accepting the devices.
2. Look for a trigger: a recently restored cell (devices retrying without back-off), an MQTT broker or
   load balancer dropping idle connections (keep-alive shorter than NAT timeout), or a server-side change.
3. Check whether the affected devices share an application server endpoint or keep-alive configuration.

## Remediation
- Enforce exponential back-off with jitter on reconnect in device configuration.
- Align MQTT keep-alive with carrier NAT timeouts (typically below 120 s for some carriers) or move to
  UDP/CoAP with PSM for low-power devices.
- Rate-limit reconnects server-side to protect the broker while the fleet recovers.

## Truck roll criteria
No immediate truck roll. Schedule battery replacement only for devices whose remaining battery fell below
the field-service threshold during the storm.

## Customer communication
"We detected devices reconnecting more often than normal, which can shorten battery life. We have applied a
configuration fix remotely and are monitoring the affected devices."
