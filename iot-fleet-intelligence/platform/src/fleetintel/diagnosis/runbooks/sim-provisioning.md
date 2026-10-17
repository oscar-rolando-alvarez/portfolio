---
id: RB-SIM-001
title: SIM provisioning and subscription state
fault_types: apn_error, roaming_misconfig
---
## Symptoms
Individual devices or SIM batches are rejected at attach (EMM #3 illegal UE, #7 EPS services not allowed) or
fail data sessions after a subscription change. Failures follow the SIM batch, not the location.

## Triage
1. Check the SIM state in the connectivity management platform: active, suspended, or test-ready.
2. Look for bulk operations: plan changes, suspensions for non-payment, or IMSI swaps on multi-IMSI SIMs.
3. Confirm the rate plan includes the requested APN and roaming zone.

## Remediation
- Re-activate wrongly suspended SIMs and re-send the subscription profile.
- Correct the rate plan or zone, then trigger a detach/re-attach via SMS or OTA command.

## Truck roll criteria
No truck roll unless the SIM must be physically replaced (damaged or non-OTA-capable SIM).

## Customer communication
"A subscription setting prevented some devices from connecting. It has been corrected remotely."
