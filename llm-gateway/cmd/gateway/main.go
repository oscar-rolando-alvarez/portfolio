// Command gateway runs the LLM gateway HTTP server.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/bootstrap"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/config"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/governance"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/telemetry"
)

// version is set at build time via -ldflags "-X main.version=...".
var version = "dev"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "fatal:", err)
		os.Exit(1)
	}
}

func run() error {
	cfgPath := flag.String("config", envOr("GATEWAY_CONFIG", "configs/gateway.yaml"), "path to the YAML configuration")
	hashKey := flag.String("hash-key", "", "print the SHA-256 of a virtual API key for the config and exit")
	validate := flag.Bool("validate", false, "validate the configuration and exit")
	flag.Parse()

	if *hashKey != "" {
		fmt.Println(governance.HashKey(*hashKey))
		return nil
	}
	cfg, err := config.Load(*cfgPath)
	if err != nil {
		return err
	}
	if *validate {
		fmt.Printf("config OK: %d providers, %d models, %d tenants\n", len(cfg.Providers), len(cfg.Models), len(cfg.Tenants))
		return nil
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	logger := telemetry.NewLogger(os.Stdout, cfg.Telemetry.LogLevel, cfg.Telemetry.LogFormat)
	slog.SetDefault(logger)

	shutdownTracing, err := telemetry.InitTracing(ctx, cfg.Telemetry.ServiceName, version, cfg.Telemetry.OTLPEndpoint, cfg.Telemetry.SampleRatio)
	if err != nil {
		return err
	}

	a, err := bootstrap.Build(ctx, cfg, bootstrap.Options{Logger: logger, ConfigPath: *cfgPath, Version: version})
	if err != nil {
		return err
	}
	defer func() { _ = a.Close() }()

	if cfg.HotReload.Enabled {
		go a.WatchConfig(ctx, cfg.HotReload.Interval)
	}

	srv := &http.Server{
		Addr:              cfg.Server.ListenAddr,
		Handler:           a.Handler,
		ReadHeaderTimeout: cfg.Server.ReadHeaderTimeout,
		ReadTimeout:       30 * time.Second,
		// WriteTimeout stays 0: SSE streams set per-event write deadlines.
		IdleTimeout:    cfg.Server.IdleTimeout,
		MaxHeaderBytes: 64 << 10,
	}
	errc := make(chan error, 1)
	go func() {
		logger.Info("llm gateway listening", "addr", cfg.Server.ListenAddr, "version", version,
			"providers", len(cfg.Providers), "models", len(cfg.Models), "tenants", len(cfg.Tenants))
		errc <- srv.ListenAndServe()
	}()

	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		logger.Info("shutting down", "grace", cfg.Server.ShutdownTimeout)
	}
	sctx, cancel := context.WithTimeout(context.Background(), cfg.Server.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(sctx); err != nil {
		logger.Error("graceful shutdown incomplete", "err", err)
	}
	return shutdownTracing(sctx)
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
