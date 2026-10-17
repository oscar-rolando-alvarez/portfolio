// Package bootstrap is the composition root: it turns a configuration into a
// fully wired gateway (adapters, stores, telemetry, HTTP handler). It is
// shared by the server binary, integration tests and the eval harness.
package bootstrap

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"sync"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/adapters/memstore"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/adapters/provider/mock"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/adapters/provider/openai"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/adapters/redisstore"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/app"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/audit"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/cache"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/config"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/governance"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/httpapi"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/routing"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/telemetry"
)

// Options customise wiring (mainly for tests and evals).
type Options struct {
	Logger     *slog.Logger
	AuditSink  audit.Sink // overrides config.audit
	ConfigPath string     // enables Reload
	Version    string
	Now        func() time.Time
}

// App is a wired gateway instance.
type App struct {
	Config  *config.Config
	Gateway *app.Gateway
	Handler http.Handler
	Metrics *telemetry.Metrics
	Logger  *slog.Logger

	mu       sync.Mutex
	version  int64
	path     string
	closers  []func() error
	adminKey func() string
}

// ProviderFactory builds provider adapters from configuration.
func ProviderFactory(now func() time.Time) app.ProviderFactory {
	return func(p config.Provider) (core.Provider, error) {
		switch p.Type {
		case "mock":
			return mock.New(p.Name, mock.Options{
				Latency: p.Mock.Latency, ChunkDelay: p.Mock.ChunkDelay, FailStatus: p.Mock.FailStatus,
				EmbeddingDims: p.Mock.EmbeddingDims, Now: now,
			}), nil
		case "openai":
			tr := &http.Transport{
				Proxy:                 http.ProxyFromEnvironment,
				DialContext:           (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
				ForceAttemptHTTP2:     true,
				MaxIdleConns:          512,
				MaxIdleConnsPerHost:   128,
				IdleConnTimeout:       90 * time.Second,
				TLSHandshakeTimeout:   5 * time.Second,
				ResponseHeaderTimeout: p.Timeout,
			}
			return openai.New(p.Name, openai.Options{
				BaseURL: p.BaseURL, APIKey: p.APIKey, APIKeyHeader: p.APIKeyHeader, Headers: p.Headers,
				// No client-level timeout: it would cut long streams. Attempt
				// deadlines are enforced by the router via context.
				Client: &http.Client{Transport: otelhttp.NewTransport(tr)},
			}), nil
		default:
			return nil, fmt.Errorf("unknown provider type %q", p.Type)
		}
	}
}

// Build wires an App from cfg.
func Build(ctx context.Context, cfg *config.Config, o Options) (*App, error) {
	if o.Now == nil {
		o.Now = time.Now
	}
	logger := o.Logger
	if logger == nil {
		logger = telemetry.NewLogger(os.Stdout, cfg.Telemetry.LogLevel, cfg.Telemetry.LogFormat)
	}
	a := &App{Config: cfg, Logger: logger, path: o.ConfigPath, version: 1}
	metrics := telemetry.NewMetrics()
	a.Metrics = metrics

	var (
		limiter core.RateLimiter
		usage   core.UsageStore
		kv      core.KV
		ready   []core.Pinger
	)
	if cfg.Redis.URL != "" {
		st, err := redisstore.New(ctx, cfg.Redis.URL, cfg.Redis.KeyPrefix)
		if err != nil {
			return nil, err
		}
		a.closers = append(a.closers, st.Close)
		limiter, usage, kv = st.RateLimiter(), st.UsageStore(), st.KV()
		ready = append(ready, st)
		logger.Info("state backend: redis")
	} else {
		limiter, usage, kv = memstore.NewRateLimiter(o.Now), memstore.NewUsageStore(), memstore.NewKV(50_000, o.Now)
		logger.Warn("state backend: in-memory (single replica only; set redis.url for production)")
	}

	sink := o.AuditSink
	if sink == nil {
		sink = audit.Nop{}
		if cfg.Audit.Enabled {
			var w io.Writer = os.Stdout
			if cfg.Audit.Path != "" && cfg.Audit.Path != "stdout" {
				f, err := os.OpenFile(cfg.Audit.Path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
				if err != nil {
					return nil, fmt.Errorf("open audit log: %w", err)
				}
				a.closers = append(a.closers, f.Close)
				w = f
			}
			sink = audit.NewSlogSink(w)
		}
	}

	rt, err := app.BuildRuntime(cfg, ProviderFactory(o.Now), a.version)
	if err != nil {
		return nil, err
	}
	reg := routing.NewRegistry(metrics)
	gov := governance.NewGovernor(limiter, usage, metrics, logger, o.Now)
	g := app.New(rt, app.Deps{
		Registry: reg, Governor: gov, Idempotency: kv, Audit: sink, Metrics: metrics, Logger: logger, Now: o.Now,
	})
	var embedder core.Embedder
	if cfg.Embeddings.Alias != "" {
		embedder = &app.RouteEmbedder{G: g, Timeout: 2 * time.Second}
	}
	g.Cache = cache.New(kv, cache.NewSemanticIndex(4096, o.Now), embedder)
	a.Gateway = g

	a.adminKey = func() string { return g.Runtime().Config.Admin.APIKeySHA256 }
	var reload func(context.Context) error
	if o.ConfigPath != "" {
		reload = func(context.Context) error { return a.Reload() }
	}
	a.Handler = httpapi.NewHandler(httpapi.Options{
		Gateway: g, Metrics: metrics, Logger: logger, MaxBodyBytes: cfg.Server.MaxBodyBytes,
		RequestTimeout: cfg.Server.RequestTimeout, AdminKeySHA256: a.adminKey, Ready: ready,
		Reload: reload, Version: o.Version,
	})
	return a, nil
}

// Reload re-reads the config file and atomically swaps tenants, routes and
// guardrail policies. Listener address and state backend changes require a
// restart and are ignored (logged).
func (a *App) Reload() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.path == "" {
		return fmt.Errorf("no config path")
	}
	cfg, err := config.Load(a.path)
	if err != nil {
		return err
	}
	cur := a.Gateway.Runtime().Config
	if cfg.Redis.URL != cur.Redis.URL || cfg.Server.ListenAddr != cur.Server.ListenAddr {
		a.Logger.Warn("redis.url / server.listen_addr changes require a restart; keeping current values")
		cfg.Redis, cfg.Server = cur.Redis, cur.Server
	}
	rt, err := app.BuildRuntime(cfg, ProviderFactory(time.Now), a.version+1)
	if err != nil {
		return err
	}
	a.version++
	a.Gateway.Swap(rt)
	a.Logger.Info("configuration reloaded", "version", a.version, "tenants", len(cfg.Tenants), "models", len(cfg.Models))
	return nil
}

// WatchConfig polls the config file and reloads on change until ctx ends.
func (a *App) WatchConfig(ctx context.Context, interval time.Duration) {
	if a.path == "" {
		return
	}
	last := modTime(a.path)
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if m := modTime(a.path); !m.Equal(last) {
				last = m
				if err := a.Reload(); err != nil {
					a.Logger.Error("config reload rejected; keeping previous version", "err", err)
				}
			}
		}
	}
}

func modTime(p string) time.Time {
	st, err := os.Stat(p)
	if err != nil {
		return time.Time{}
	}
	return st.ModTime()
}

// Close releases resources.
func (a *App) Close() error {
	var first error
	for _, c := range a.closers {
		if err := c(); err != nil && first == nil {
			first = err
		}
	}
	return first
}
