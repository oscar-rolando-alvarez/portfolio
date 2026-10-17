// Package ingest consumes the telemetry topic and feeds the aggregators.
//
// Every gateway replica reads all partitions directly (no consumer group):
// each replica must see the whole fleet to aggregate it, and the live view
// has no need for committed offsets - it starts at the end of the log by
// default. Consumption is pull-based, so a slow aggregator simply polls less
// often (natural backpressure); fetch sizes bound memory.
package ingest

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"sync/atomic"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/gateway/internal/agg"
)

// Sink receives decoded events (agg.Registry in production).
type Sink interface {
	Add(ev *agg.Event, size int) bool
}

// Config configures the consumer.
type Config struct {
	Brokers   string
	Topic     string
	FromStart bool
	Logger    *slog.Logger
}

// Stats are consumer counters.
type Stats struct {
	Records  atomic.Uint64
	Invalid  atomic.Uint64
	Ready    atomic.Bool
	LastPoll atomic.Int64 // unix ms of the last successful fetch
}

// Run consumes until ctx is cancelled.
func Run(ctx context.Context, cfg Config, sink Sink, st *Stats) error {
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.DiscardHandler)
	}
	offset := kgo.NewOffset().AtEnd()
	if cfg.FromStart {
		offset = kgo.NewOffset().AtStart()
	}
	cl, err := kgo.NewClient(
		kgo.SeedBrokers(strings.Split(cfg.Brokers, ",")...),
		kgo.ConsumeTopics(cfg.Topic),
		kgo.ConsumeResetOffset(offset),
		kgo.FetchMaxBytes(16<<20),
		kgo.FetchMaxPartitionBytes(4<<20),
		kgo.FetchMaxWait(500*time.Millisecond),
		kgo.MetadataMinAge(time.Second),
		kgo.MetadataMaxAge(3*time.Second), // pick up the topic quickly once the simulator creates it
		kgo.ClientID("fleetintel-live-gateway"),
	)
	if err != nil {
		return err
	}
	defer cl.Close()
	cfg.Logger.Info("consuming", "topic", cfg.Topic, "brokers", cfg.Brokers, "from_start", cfg.FromStart)
	go func() { // readiness: brokers reachable
		for ctx.Err() == nil && !st.Ready.Load() {
			pctx, cancel := context.WithTimeout(ctx, 3*time.Second)
			if cl.Ping(pctx) == nil {
				st.Ready.Store(true)
			}
			cancel()
			if !st.Ready.Load() {
				time.Sleep(time.Second)
			}
		}
	}()
	for {
		fetches := cl.PollFetches(ctx)
		if ctx.Err() != nil {
			return nil
		}
		fetches.EachError(func(topic string, p int32, err error) {
			if !errors.Is(err, context.Canceled) {
				cfg.Logger.Warn("fetch error", "topic", topic, "partition", p, "err", err)
			}
		})
		st.LastPoll.Store(time.Now().UnixMilli())
		fetches.EachRecord(func(r *kgo.Record) {
			st.Records.Add(1)
			var ev agg.Event
			if err := json.Unmarshal(r.Value, &ev); err != nil || ev.DeviceID == "" {
				st.Invalid.Add(1)
				return
			}
			sink.Add(&ev, len(r.Value))
		})
	}
}
