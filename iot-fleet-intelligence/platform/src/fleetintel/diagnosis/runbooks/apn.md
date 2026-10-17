---
id: RB-APN-001
title: APN / PDN connectivity failures
fault_types: apn_error
---
## Symptoms
Devices attach to the network successfully but data session (PDN/PDP context) activation fails with ESM
cause #27 (missing or unknown APN) or #33 (requested service option not subscribed). All affected devices
share the same APN regardless of cell or radio quality.

## Triage
1. Confirm the failures are concentrated on one APN across many cells: this rules out radio problems.
2. Check recent changes to the APN in the subscriber profile (HSS/UDM), the PGW/SMF configuration, DNS
   for the APN, or a device configuration push that changed the APN string.
3. Compare the APN string reported by devices with the provisioned one (typos and case are common).

## Remediation
- Roll back the most recent APN or subscriber profile change for the affected SIM group.
- If devices were reconfigured with a wrong APN, push the corrected configuration over the air.
- Verify PGW/SMF capacity and IP pool exhaustion for the APN (ESM #26 points to resources).

## Truck roll criteria
No truck roll. APN problems are resolved through core network or over-the-air configuration.

## Customer communication
"Some devices could not start data sessions because of a network configuration issue. We are restoring the
configuration remotely; no on-site action is needed."
