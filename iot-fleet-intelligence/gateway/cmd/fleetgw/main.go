// Command fleetgw is the live gateway: it consumes fleet telemetry from
// Kafka, aggregates it per second per tenant, follows confirmed incidents and
// AI diagnoses from the platform API, and pushes everything to dashboards
// over Server-Sent Events.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/gateway/internal/agg"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/gateway/internal/config"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/gateway/internal/hub"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/gateway/internal/incidents"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/gateway/internal/ingest"
	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/gateway/internal/server"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil)).With("service", "fleetintel-live-gateway")
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" { // distroless has no curl
		os.Exit(healthcheck())
	}
	if err := run(logger); err != nil {
		logger.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func healthcheck() int {
	addr := os.Getenv("FLEETGW_ADDR")
	if addr == "" {
		addr = ":8090"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://127.0.0.1"+addrPort(addr)+"/healthz", http.NoBody) //nolint:gosec // loopback probe of our own port
	if err != nil {
		return 1
	}
	resp, err := http.DefaultClient.Do(req) //nolint:gosec // loopback probe of our own port
	if err != nil {
		return 1
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

func addrPort(addr string) string {
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			return addr[i:]
		}
	}
	return ":" + addr
}

// app wires the components and implements server.State.
type app struct {
	reg    *agg.Registry
	hub    *hub.Hub
	poller *incidents.Poller
	kafka  *ingest.Stats
}

func (a *app) Aggregator(t string) *agg.Aggregator { return a.reg.Get(t) }
func (a *app) Tenants() []string                   { return a.reg.Tenants() }
func (a *app) Ready() bool                         { return a.kafka.Ready.Load() }

func (a *app) RecentIncidents(t string) []json.RawMessage {
	if a.poller == nil {
		return []json.RawMessage{}
	}
	return a.poller.Recent(t)
}

func (a *app) Metrics() map[string]float64 {
	m := map[string]float64{
		"fleetgw_kafka_records_total":   float64(a.kafka.Records.Load()),
		"fleetgw_kafka_invalid_total":   float64(a.kafka.Invalid.Load()),
		"fleetgw_events_rejected_total": float64(a.reg.Rejected()),
		"fleetgw_tenants":               float64(len(a.reg.Tenants())),
		"fleetgw_kafka_ready":           0,
	}
	if a.kafka.Ready.Load() {
		m["fleetgw_kafka_ready"] = 1
	}
	if a.poller != nil {
		polls, errs, n := a.poller.Stats()
		m["fleetgw_incident_polls_total"] = float64(polls)
		m["fleetgw_incident_poll_errors_total"] = float64(errs)
		m["fleetgw_incidents_tracked"] = float64(n)
	}
	return m
}

func run(logger *slog.Logger) error {
	cfg, err := config.FromEnv(nil)
	if err != nil {
		return err
	}
	if len(cfg.APIKeys) == 0 {
		logger.Warn("FLEETGW_API_KEYS is empty: stream is unauthenticated (local development only)")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	a := &app{
		reg: agg.NewRegistry(agg.Config{
			Window: cfg.Window, OnlineTTL: cfg.OnlineTTL, SampleBudget: cfg.SampleBudget,
		}, cfg.MaxTenants),
		hub:   hub.New(cfg.ClientBuffer, 64, cfg.MaxClients),
		kafka: &ingest.Stats{},
	}
	if cfg.PlatformURL != "" {
		a.poller = incidents.New(incidents.Config{
			BaseURL: cfg.PlatformURL, APIKey: cfg.PlatformAPIKey, Interval: cfg.PollInterval,
			Locales: cfg.Locales, Logger: logger,
		}, func(tenant string, data []byte) {
			a.hub.Publish(tenant, hub.Frame{Event: "incident", Data: data})
		}, func(tenant, scopeType, scope string) int64 {
			if ag := a.reg.Get(tenant); ag != nil {
				return ag.Onset(scopeType, scope)
			}
			return 0
		})
	}

	var wg sync.WaitGroup
	errc := make(chan error, 2)
	wg.Go(func() {
		if err := ingest.Run(ctx, ingest.Config{
			Brokers: cfg.KafkaBrokers, Topic: cfg.KafkaTopic, FromStart: cfg.KafkaFromStart, MSKIAM: cfg.KafkaMSKIAM, Logger: logger,
		}, a.reg, a.kafka); err != nil {
			errc <- fmt.Errorf("kafka: %w", err)
		}
	})
	if a.poller != nil {
		wg.Go(func() { a.poller.Run(ctx) })
	}
	wg.Go(func() { tickLoop(ctx, a) })

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           server.New(server.Config{APIKeys: cfg.APIKeys, DefaultTenant: cfg.DefaultTenant, AllowedOrigins: cfg.AllowedOrigins, Logger: logger}, a.hub, a),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	wg.Go(func() {
		logger.Info("listening", "addr", cfg.Addr, "platform", cfg.PlatformURL != "", "auth", len(cfg.APIKeys) > 0)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errc <- err
		}
	})
	select {
	case <-ctx.Done():
	case err = <-errc:
	}
	stop()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	wg.Wait()
	return err
}

// tickLoop closes one second per tenant, serialises each frame once and fans it out.
func tickLoop(ctx context.Context, a *app) {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		for _, tenant := range a.reg.Tenants() {
			snap, cells := a.reg.Get(tenant).Tick()
			if data, err := json.Marshal(snap); err == nil {
				a.hub.Publish(tenant, hub.Frame{Event: "snapshot", ID: snap.Seq, Data: data})
			}
			if cells != nil {
				if data, err := json.Marshal(cells); err == nil {
					a.hub.Publish(tenant, hub.Frame{Event: "cells", Data: data})
				}
			}
		}
	}
}
