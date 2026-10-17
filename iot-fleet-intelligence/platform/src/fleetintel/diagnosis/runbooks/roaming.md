---
id: RB-ROAM-001
title: Roaming attach failures on a visited network
fault_types: roaming_misconfig
---
## Symptoms
Roaming devices on one visited network (PLMN) are rejected at attach with EMM cause #15 (no suitable cells
in tracking area) or #13 (roaming not allowed in this tracking area). Devices from the same fleet on other
visited networks and at home are unaffected. Devices retry, so reconnect counts and battery drain rise.

## Triage
1. Confirm that rejects are concentrated on one visited PLMN and that a roaming agreement exists.
2. If the agreement exists, the cause is usually provisioning: steering-of-roaming lists, the subscriber
   profile in the HSS/HLR (roaming restriction flags), or an expired IMSI range opening at the partner.
3. Check recent changes: SIM profile pushes, steering list updates, or the partner's IR.21 updates.

## Remediation
- Ask carrier relations to verify the IMSI range is opened at the visited partner and that the steering
  list did not bar the network.
- Correct the subscriber profile roaming restrictions for the affected SIM group.
- As a stop-gap, allow devices to select an alternative partner network in the same country.

## Truck roll criteria
No truck roll. Roaming provisioning is fixed remotely (SIM OTA or core network configuration).

## Customer communication
"Devices operating abroad on one partner network could not connect due to a configuration issue between
networks. We are correcting it remotely; devices will reconnect automatically."
