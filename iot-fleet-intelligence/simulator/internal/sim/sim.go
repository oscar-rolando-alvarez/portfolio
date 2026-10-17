// Package sim drives the fleet through virtual time.
//
// The engine advances a 1-second virtual clock. Devices are partitioned into
// shards (one per CPU); each shard owns a scheduler and an output arena and
// renders its due devices in parallel. After every tick the arenas are
// written to the sink in shard order, so for a fixed (seed, shards) pair the
// output is byte-for-byte reproducible.
package sim

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/simulator/internal/faults"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/simulator/internal/fleet"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/simulator/internal/sched"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/simulator/internal/sink"
)

// Config controls a simulation run.
type Config struct {
	Start     time.Time
	Duration  time.Duration
	Speed     float64 // virtual seconds per wall second; 0 = as fast as possible
	MaxRate   float64 // events per wall second cap; 0 = unlimited
	Shards    int
	Scheduler string // "wheel" or "heap"
	Faults    []faults.Resolved
	Logger    *slog.Logger
	Progress  time.Duration // progress log period (0 = off)
}

// Stats summarises a run.
type Stats struct {
	Devices      int           `json:"devices"`
	Shards       int           `json:"shards"`
	Scheduler    string        `json:"scheduler"`
	VirtualSecs  uint64        `json:"virtual_seconds"`
	Events       uint64        `json:"events"`
	Bytes        uint64        `json:"bytes"`
	Wall         time.Duration `json:"-"`
	WallSeconds  float64       `json:"wall_seconds"`
	EventsPerSec float64       `json:"events_per_second"`
	MBPerSec     float64       `json:"mb_per_second"`
}

type span struct{ k0, k1, v0, v1 int }

type shard struct {
	id     int
	sched  sched.Scheduler
	arena  []byte
	spans  []span
	recs   []sink.Record
	active []fleet.ActiveFault
	events uint64
	bytes  uint64
}

// Run executes the simulation and streams events into out.
func Run(ctx context.Context, f *fleet.Fleet, cfg Config, out sink.Sink) (Stats, error) {
	if cfg.Shards <= 0 {
		cfg.Shards = 1
	}
	if cfg.Duration <= 0 {
		return Stats{}, errors.New("duration must be > 0")
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.DiscardHandler)
	}
	n := f.Len()
	shards := make([]*shard, cfg.Shards)
	for s := range shards {
		var sc sched.Scheduler
		switch cfg.Scheduler {
		case "heap":
			sc = sched.NewHeap(n/cfg.Shards+1, 0)
		case "wheel", "":
			sc = sched.NewWheel(4096, 0)
		default:
			return Stats{}, fmt.Errorf("unknown scheduler %q", cfg.Scheduler)
		}
		shards[s] = &shard{id: s, sched: sc}
	}
	for i := range uint32(n) {
		sh := shards[int(i)%cfg.Shards]
		sh.sched.Schedule(i, f.FirstReport(i, 0))
	}

	total := uint64(cfg.Duration / time.Second)
	begin := time.Now()
	lastLog := begin
	var emitted uint64
	var wg sync.WaitGroup
	for tick := range total {
		if err := ctx.Err(); err != nil {
			return summarize(f, cfg, shards, tick, begin), err
		}
		ts := cfg.Start.Add(time.Duration(tick) * time.Second).UTC()
		prefix := ts.AppendFormat(nil, "2006-01-02T15:04:05")
		for _, sh := range shards {
			wg.Add(1)
			go func() {
				defer wg.Done()
				sh.step(f, cfg.Faults, tick, prefix)
			}()
		}
		wg.Wait()
		for _, sh := range shards {
			if len(sh.recs) == 0 {
				continue
			}
			if err := out.Write(ctx, sh.recs); err != nil {
				return summarize(f, cfg, shards, tick, begin), fmt.Errorf("sink: %w", err)
			}
			emitted += uint64(len(sh.recs))
		}
		pace(cfg, begin, tick+1, emitted)
		if cfg.Progress > 0 && time.Since(lastLog) >= cfg.Progress {
			lastLog = time.Now()
			st := summarize(f, cfg, shards, tick+1, begin)
			cfg.Logger.Info("progress", "virtual_time", ts.Format(time.RFC3339),
				"events", st.Events, "events_per_sec", int(st.EventsPerSec))
		}
	}
	return summarize(f, cfg, shards, total, begin), nil
}

func (sh *shard) step(f *fleet.Fleet, rs []faults.Resolved, tick uint64, prefix []byte) {
	sh.arena = sh.arena[:0]
	sh.spans = sh.spans[:0]
	sh.active = faults.Active(rs, tick, sh.active)
	sh.sched.Advance(func(d uint32) {
		k0 := len(sh.arena)
		sh.arena = append(sh.arena, f.CellID[f.Cell[d]]...)
		v0 := len(sh.arena)
		var next uint64
		sh.arena, next = f.Emit(sh.arena, d, tick, prefix, sh.active)
		sh.spans = append(sh.spans, span{k0, v0, v0, len(sh.arena)})
		sh.sched.Schedule(d, next)
	})
	// Build record views only after the arena stopped growing.
	sh.recs = sh.recs[:0]
	for _, s := range sh.spans {
		sh.recs = append(sh.recs, sink.Record{Key: sh.arena[s.k0:s.k1], Value: sh.arena[s.v0:s.v1]})
		sh.bytes += uint64(s.v1 - s.v0)
	}
	sh.events += uint64(len(sh.spans))
}

func pace(cfg Config, begin time.Time, ticksDone, emitted uint64) {
	var wait time.Duration
	if cfg.Speed > 0 {
		target := time.Duration(float64(ticksDone) / cfg.Speed * float64(time.Second))
		wait = max(wait, target-time.Since(begin))
	}
	if cfg.MaxRate > 0 {
		target := time.Duration(float64(emitted) / cfg.MaxRate * float64(time.Second))
		wait = max(wait, target-time.Since(begin))
	}
	if wait > 0 {
		time.Sleep(wait)
	}
}

func summarize(f *fleet.Fleet, cfg Config, shards []*shard, ticks uint64, begin time.Time) Stats {
	st := Stats{Devices: f.Len(), Shards: len(shards), Scheduler: cfg.Scheduler, VirtualSecs: ticks}
	if st.Scheduler == "" {
		st.Scheduler = "wheel"
	}
	for _, sh := range shards {
		st.Events += sh.events
		st.Bytes += sh.bytes
	}
	st.Wall = time.Since(begin)
	st.WallSeconds = st.Wall.Seconds()
	if s := st.Wall.Seconds(); s > 0 {
		st.EventsPerSec = float64(st.Events) / s
		st.MBPerSec = float64(st.Bytes) / s / 1e6
	}
	return st
}
