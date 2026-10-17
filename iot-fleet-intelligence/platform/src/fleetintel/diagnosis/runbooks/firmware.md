---
id: RB-FW-001
title: Firmware regression (watchdog resets after a rollout)
fault_types: firmware_regression
---
## Symptoms
Devices running one firmware build reset unexpectedly (watchdog or hard fault), reconnect after every reset
and drain battery faster. The problem follows the firmware version across cells and networks, which
separates it from radio or core-network issues. It usually starts shortly after a staged rollout.

## Triage
1. Confirm resets are concentrated on a single firmware version and that other versions of the same
   profile are healthy.
2. Check the device-management system for the rollout schedule and the share of the fleet already updated.
3. Pull crash dumps or reset-reason registers from a sample of affected devices.

## Remediation
- Halt the staged rollout immediately to cap the blast radius.
- Roll back affected devices to the previous known-good build over the air (FOTA), in waves.
- Add the reset-rate metric to the rollout canary gate before resuming.

## Truck roll criteria
Truck roll only for devices that cannot complete an over-the-air rollback (bricked or boot-looping devices).
Most devices recover remotely.

## Customer communication
"A recent software update caused some devices to restart unexpectedly. We have paused the update and are
restoring the previous version remotely."
