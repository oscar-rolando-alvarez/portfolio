// Package app contains the gateway use cases: the chat/embeddings pipeline
// that composes authentication, governance, guardrails, caching, routing and
// accounting. It depends only on core ports and domain packages; concrete
// adapters are injected by the composition root (cmd/gateway).
package app

import (
	"fmt"
	"slices"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/config"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/governance"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/guardrails"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/routing"
)

// ProviderFactory builds a provider adapter from configuration.
type ProviderFactory func(p config.Provider) (core.Provider, error)

// Runtime is an immutable snapshot derived from one configuration version.
// Hot reload swaps the whole snapshot atomically.
type Runtime struct {
	Config   *config.Config
	Auth     *governance.Authenticator
	Routes   map[string]*routing.Route
	Aliases  []string
	scanners map[string]*guardrails.PIIScanner
	Version  int64
}

// BuildRuntime resolves providers and routes for cfg.
func BuildRuntime(cfg *config.Config, factory ProviderFactory, version int64) (*Runtime, error) {
	providers := make(map[string]core.Provider, len(cfg.Providers))
	for _, pc := range cfg.Providers {
		p, err := factory(pc)
		if err != nil {
			return nil, fmt.Errorf("provider %q: %w", pc.Name, err)
		}
		providers[pc.Name] = p
	}
	rt := &Runtime{
		Config:   cfg,
		Auth:     governance.NewAuthenticator(cfg.Tenants),
		Routes:   make(map[string]*routing.Route, len(cfg.Models)),
		scanners: map[string]*guardrails.PIIScanner{},
		Version:  version,
	}
	for _, m := range cfg.Models {
		r := &routing.Route{
			Alias: m.Alias, Kind: m.Kind, Policy: m.Policy, Timeout: m.Timeout,
			Retry: m.Retry, Hedge: m.Hedge, Breaker: m.CircuitBreaker,
		}
		for _, t := range m.Targets {
			r.Targets = append(r.Targets, routing.Target{Target: t, Provider: providers[t.Provider]})
		}
		rt.Routes[m.Alias] = r
		rt.Aliases = append(rt.Aliases, m.Alias)
	}
	slices.Sort(rt.Aliases)
	for i := range cfg.Tenants {
		t := &cfg.Tenants[i]
		rt.scanners[t.ID] = guardrails.NewPIIScanner(t.Guardrails.PIITypes)
	}
	return rt, nil
}

// Scanner returns the tenant's PII scanner.
func (rt *Runtime) Scanner(tenantID string) *guardrails.PIIScanner {
	if s, ok := rt.scanners[tenantID]; ok {
		return s
	}
	return guardrails.NewPIIScanner(nil)
}

// Tenant returns a tenant by ID.
func (rt *Runtime) Tenant(id string) (*config.Tenant, bool) {
	for i := range rt.Config.Tenants {
		if rt.Config.Tenants[i].ID == id {
			return &rt.Config.Tenants[i], true
		}
	}
	return nil, false
}
