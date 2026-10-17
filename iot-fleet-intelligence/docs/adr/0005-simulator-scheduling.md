# ADR 0005 - Simulator: struct-of-arrays state + timing wheel, counter-based randomness

- Status: accepted
- Date: 2026-10-17

## Context
To demo and load-test the platform credibly we must simulate >= 1M devices on a laptop or CI runner,
reproducibly, at event rates well above what the downstream pipeline consumes.

## Decision
- **No goroutine per device.** Device state lives in flat, typed slices (struct-of-arrays): cell, profile,
  firmware, APN, battery, sequence, last reset, interval, RSRP offset - **20 bytes per device**.
- **Hashed timing wheel** (4096 one-second slots) stores only a `uint32` device index per pending report:
  O(1) schedule/pop, zero steady-state allocations. A binary heap implementation is kept for comparison.
- **Counter-based RNG**: each event's randomness is `splitmix64(seed, device, seq)`, so output does not depend
  on goroutine scheduling, and no per-device RNG state is stored.
- **Sharded generation**: devices are partitioned across N shards (one per CPU); shards render a tick in
  parallel into arenas, then the arenas are written in shard order - byte-identical output for a fixed
  (seed, shard count). JSON is hand-encoded with `strconv.Append*` (0 allocations per event).
- Faults are declarative JSON scenarios (`scenarios/*.json`) resolved against the fleet (`auto` targets the
  busiest cell, largest roaming partner, etc.) and emitted as ground-truth labels for the eval harness.

## Consequences (measured on an Apple M3 Pro, 11 cores)
| Run | Events | Throughput | Heap |
|---|---:|---:|---:|
| 1M devices, 10 virtual min, 1 shard | 8.29M | 2.5M events/s | 71 MB |
| 1M devices, 10 virtual min, 11 shards | 8.29M | 12.0M events/s | 84 MB |
| 1M devices, heap scheduler, 11 shards | 8.29M | 9.5M events/s | 49 MB |
| 10M devices, 5 virtual min, 11 shards | 41.4M | 8.3M events/s | 584 MB |
| 1M devices to a JSONL file | 8.29M | 5.7M events/s (2.7 GB/s) | 85 MB |

Micro-benchmarks: `Emit` 339 ns/event, 0 allocs; wheel reschedule 3.4 ns vs heap 78 ns (1M pending).
Real sinks are the bottleneck (Kafka ~1M events/s from a container), which is the intended shape.

## Alternatives considered
- Goroutine/timer per device: ~2-4 KB per device just in stacks, scheduler thrash past ~100k devices.
- Discrete-event simulation frameworks: unnecessary generality and dependencies for a fixed-tick model.
