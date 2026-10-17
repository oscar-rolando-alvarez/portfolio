# ADR 0004 - Windowed EWMA/z-score detection with a rule table (no isolation forest)

- Status: accepted
- Date: 2026-10-17

## Context
We need to detect six connectivity fault classes from noisy per-device telemetry, per scope (cell, visited
network, APN, firmware build), in a stateless Lambda, with explainable evidence that an LLM and an engineer
can both reason about. False positives burn NOC time and LLM tokens; false negatives cost truck rolls.

## Decision
- Tumbling **event-time windows** (60 s default) per scope; a watermark (max event time - allowed lateness)
  closes windows; late events are counted and dropped.
- Per scope and metric an **EWMA baseline** (mean + variance, alpha 0.2). A metric is anomalous only when all
  hold: |z| >= 4 (direction-aware), the absolute effect exceeds a per-metric minimum (guards against
  near-zero variance), and the window has >= `min_samples` events. Priors cover the warm-up period.
  Anomalous windows do not update the baseline (no self-poisoning) unless they persist for 30 windows
  (accepted level shift).
- A small **rule table** maps anomalous metric sets to a *suspected* fault class (e.g. no-service ratio up on
  a cell -> outage; SINR down with service -> congestion; reconnects up with service and few rejects ->
  storm; attach rejects on a visited PLMN -> roaming; PDN rejects on an APN -> APN error; resets on a build
  -> firmware regression). Consecutive anomalous windows form one **episode = one incident** with a
  deterministic id.
- State (open windows, baselines, episodes) is a serialisable object persisted per Kafka partition with an
  offset watermark, so replays are idempotent.

## Consequences
- Fully explainable: every incident carries metric, value, baseline and z-score - the evidence the LLM must
  cite. Pure Python, no numpy/scikit-learn in the Lambda package (cold start, size).
- Measured on the golden set: precision 1.00, recall 1.00 including weak (45% intensity) and brief (90 s)
  faults, zero false positives on the fault-free baseline, ~90 s time-to-detect (one window + lateness).
- Univariate thresholds can miss subtle multivariate drift; the classifier is hand-written and must evolve
  with new fault classes (each needs a golden scenario first).

## Alternatives considered
- **Isolation forest / autoencoders**: better at unknown-unknowns, but needs training data per fleet, model
  hosting, and produces scores that are hard to turn into actionable evidence. A good *second-stage* candidate
  for novelty detection behind the same incident interface.
- **Static thresholds**: simple but do not adapt to per-cell baselines (rural vs urban SINR differ by 10 dB).
