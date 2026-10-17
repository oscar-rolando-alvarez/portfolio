// Command fleetsim simulates a large IoT device fleet with injectable
// connectivity faults and streams telemetry to Kafka, SQS or JSONL files.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/simulator/internal/faults"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/simulator/internal/fleet"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/simulator/internal/sim"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/simulator/internal/sink"
)

type faultFlags []faults.Spec

func (f *faultFlags) String() string { return fmt.Sprint(len(*f)) }

func (f *faultFlags) Set(v string) error {
	s, err := faults.ParseFlag(v)
	if err != nil {
		return err
	}
	*f = append(*f, s)
	return nil
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "fleetsim:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	fs := flag.NewFlagSet("fleetsim", flag.ContinueOnError)
	var (
		devices   = fs.Int("devices", 100_000, "number of simulated devices")
		seed      = fs.Uint64("seed", 42, "deterministic seed")
		tenant    = fs.String("tenant", envOr("FLEETSIM_TENANT", "acme-utilities"), "tenant id stamped on every event")
		density   = fs.Int("density", 50, "average devices per cell")
		scale     = fs.Float64("interval-scale", 1, "multiplier applied to every profile reporting interval")
		duration  = fs.Duration("duration", 20*time.Minute, "virtual time to simulate")
		startStr  = fs.String("start", "2026-10-01T00:00:00Z", "virtual start time (RFC3339)")
		speed     = fs.Float64("speed", 0, "virtual seconds per wall second (0 = as fast as possible)")
		rate      = fs.Float64("rate", 0, "max events per wall second (0 = unlimited)")
		shards    = fs.Int("shards", runtime.GOMAXPROCS(0), "parallel generator shards (output order is deterministic per shard count)")
		scheduler = fs.String("scheduler", "wheel", "scheduler implementation: wheel|heap")
		scenario  = fs.String("scenario", "", "fault scenario JSON file")
		sinkKind  = fs.String("sink", "file", "output: file|kafka|sqs|discard")
		out       = fs.String("out", "-", "output file for -sink=file ('-' = stdout)")
		labels    = fs.String("labels", "", "write the ground-truth fault manifest (JSON) here")
		brokers   = fs.String("kafka-brokers", envOr("KAFKA_BROKERS", "localhost:9092"), "comma-separated Kafka bootstrap servers")
		topic     = fs.String("kafka-topic", envOr("KAFKA_TOPIC", "fleet.telemetry.v1"), "Kafka topic")
		create    = fs.Bool("kafka-create-topic", true, "create the topic if it does not exist")
		parts     = fs.Int("kafka-partitions", 6, "partitions when creating the topic")
		queueURL  = fs.String("sqs-queue-url", os.Getenv("SQS_QUEUE_URL"), "SQS queue URL for -sink=sqs")
		bundle    = fs.Int("sqs-bundle", 10, "events per SQS message")
		progress  = fs.Duration("progress", 5*time.Second, "progress log period (0 = off)")
		quiet     = fs.Bool("quiet", false, "suppress the final JSON summary")
	)
	var faultList faultFlags
	fs.Var(&faultList, "fault", "inject a fault, e.g. cell_outage:target=auto,start=8m,duration=6m (repeatable)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))

	start, err := time.Parse(time.RFC3339, *startStr)
	if err != nil {
		return fmt.Errorf("-start: %w", err)
	}
	specs := []faults.Spec(faultList)
	scenarioName := "adhoc"
	if *scenario != "" {
		sc, err := faults.Load(*scenario)
		if err != nil {
			return err
		}
		scenarioName = sc.Name
		specs = append(sc.Faults, specs...)
	}

	t0 := time.Now()
	fl, err := fleet.New(fleet.Config{Devices: *devices, Seed: *seed, Tenant: *tenant, Density: *density, IntervalScale: *scale})
	if err != nil {
		return err
	}
	resolved, err := faults.Resolve(specs, fl)
	if err != nil {
		return err
	}
	var ms runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&ms)
	logger.Info("fleet ready", "devices", fl.Len(), "cells", len(fl.CellID), "build_ms", time.Since(t0).Milliseconds(),
		"heap_mb", ms.HeapAlloc/1e6, "faults", len(resolved))
	if *labels != "" {
		m := faults.BuildManifest(scenarioName, *seed, *tenant, fl.Len(), start, *duration, resolved)
		data, err := json.MarshalIndent(m, "", "  ")
		if err != nil {
			return err
		}
		if err := os.WriteFile(*labels, append(data, '\n'), 0o600); err != nil {
			return err
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	snk, err := openSink(ctx, *sinkKind, *out, *brokers, *topic, *create, int32(*parts), *queueURL, *bundle)
	if err != nil {
		return err
	}
	stats, runErr := sim.Run(ctx, fl, sim.Config{
		Start: start, Duration: *duration, Speed: *speed, MaxRate: *rate, Shards: *shards,
		Scheduler: *scheduler, Faults: resolved, Logger: logger, Progress: *progress,
	}, snk)
	closeCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	closeErr := snk.Close(closeCtx)
	if !*quiet {
		runtime.ReadMemStats(&ms)
		summary := map[string]any{
			"stats": stats, "heap_mb": ms.HeapAlloc / 1e6, "cells": len(fl.CellID),
			"bytes_per_device_state": fleet.BytesPerDevice, "sink": *sinkKind,
		}
		data, _ := json.Marshal(summary)
		fmt.Fprintln(os.Stderr, string(data))
	}
	if errors.Is(runErr, context.Canceled) {
		runErr = nil
	}
	return errors.Join(runErr, closeErr)
}

func openSink(ctx context.Context, kind, out, brokers, topic string, create bool, parts int32, queueURL string, bundle int) (sink.Sink, error) {
	switch kind {
	case "file":
		return sink.NewFile(out)
	case "discard":
		return &sink.Discard{}, nil
	case "kafka":
		return sink.NewKafka(ctx, sink.KafkaConfig{
			Brokers: strings.Split(brokers, ","), Topic: topic, CreateTopic: create, Partitions: parts,
		})
	case "sqs":
		if queueURL == "" {
			return nil, errors.New("-sqs-queue-url (or SQS_QUEUE_URL) is required for -sink=sqs")
		}
		return sink.NewSQSFromEnv(ctx, sink.SQSConfig{QueueURL: queueURL, Bundle: bundle})
	}
	return nil, fmt.Errorf("unknown sink %q", kind)
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
