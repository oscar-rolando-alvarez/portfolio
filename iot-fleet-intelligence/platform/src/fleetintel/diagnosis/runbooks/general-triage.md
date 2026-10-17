---
id: RB-GEN-001
title: General connectivity triage and evidence standards
fault_types: cell_outage, congestion, reconnect_storm, roaming_misconfig, apn_error, firmware_regression
---
## Scope the blast radius first
Group affected devices by cell, visited network, APN, firmware build and device profile. The dimension where
failures concentrate is the strongest root-cause signal: location points to radio, APN points to core
network configuration, firmware points to the device, visited network points to roaming.

## Evidence standards
A diagnosis must cite measured evidence: the metric, its value and its baseline. Fewer than three affected
devices, or a deviation that is not statistically significant, is insufficient evidence. In that case the
correct answer is to request more data rather than to guess a cause.

## Truck roll economics
A truck roll typically costs far more than a remote fix. Dispatch field service only when the device or
site requires physical intervention: damaged hardware, a bricked device that cannot be recovered over the
air, or an exhausted battery.

## Customer communication
Customer messages must be plain language, avoid internal identifiers such as device ids or IMSIs, state
whether customer action is required, and never speculate beyond the evidence.
