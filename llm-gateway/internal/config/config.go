// Package config loads the typed gateway configuration from YAML with
// ${ENV} / ${ENV:-default} expansion and a few explicit env overrides.
package config

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"regexp"
	"slices"
	"strings"
	"time"

	"go.yaml.in/yaml/v3"
)

// Routing policies.
const (
	PolicyPriority = "priority"
	PolicyWeighted = "weighted"
	PolicyCost     = "cost"
	PolicyLatency  = "latency"
)

// Guardrail actions.
const (
	ActionOff    = "off"
	ActionRedact = "redact"
	ActionBlock  = "block"
	ActionFlag   = "flag"
)

// Budget modes.
const (
	BudgetHard = "hard"
	BudgetSoft = "soft"
)

// Config is the root configuration document.
type Config struct {
	Server     Server      `yaml:"server"`
	Admin      Admin       `yaml:"admin"`
	Redis      Redis       `yaml:"redis"`
	Telemetry  Telemetry   `yaml:"telemetry"`
	Audit      Audit       `yaml:"audit"`
	HotReload  HotReload   `yaml:"hot_reload"`
	Embeddings Embeddings  `yaml:"embeddings"`
	Providers  []Provider  `yaml:"providers"`
	Models     []Model     `yaml:"models"`
	Tenants    []Tenant    `yaml:"tenants"`
	Defaults   TenantRules `yaml:"tenant_defaults"`
}

// Server holds HTTP server settings.
type Server struct {
	ListenAddr        string        `yaml:"listen_addr"`
	ReadHeaderTimeout time.Duration `yaml:"read_header_timeout"`
	RequestTimeout    time.Duration `yaml:"request_timeout"`
	IdleTimeout       time.Duration `yaml:"idle_timeout"`
	ShutdownTimeout   time.Duration `yaml:"shutdown_timeout"`
	MaxBodyBytes      int64         `yaml:"max_body_bytes"`
}

// Admin protects the /admin endpoints.
type Admin struct {
	// APIKeySHA256 is the hex SHA-256 of the admin bearer token. Empty disables admin APIs.
	APIKeySHA256 string `yaml:"api_key_sha256"`
}

// Redis configures the shared state backend. Empty URL selects in-memory stores.
type Redis struct {
	URL       string `yaml:"url"`
	KeyPrefix string `yaml:"key_prefix"`
}

// Telemetry configures logs, traces and metrics.
type Telemetry struct {
	ServiceName  string  `yaml:"service_name"`
	LogLevel     string  `yaml:"log_level"`
	LogFormat    string  `yaml:"log_format"` // json|text
	OTLPEndpoint string  `yaml:"otlp_endpoint"`
	SampleRatio  float64 `yaml:"sample_ratio"`
}

// Audit configures the structured audit trail.
type Audit struct {
	Enabled bool   `yaml:"enabled"`
	Path    string `yaml:"path"` // empty or "stdout" writes to stdout
}

// HotReload enables periodic re-reading of the config file.
type HotReload struct {
	Enabled  bool          `yaml:"enabled"`
	Interval time.Duration `yaml:"interval"`
}

// Embeddings selects the embedding model used by the semantic cache.
type Embeddings struct {
	Alias string `yaml:"alias"`
}

// Provider is an upstream LLM endpoint.
type Provider struct {
	Name         string            `yaml:"name"`
	Type         string            `yaml:"type"` // openai|mock
	BaseURL      string            `yaml:"base_url"`
	APIKey       string            `yaml:"api_key"`
	APIKeyHeader string            `yaml:"api_key_header"` // default Authorization (Bearer)
	Headers      map[string]string `yaml:"headers"`
	Timeout      time.Duration     `yaml:"timeout"`
	Mock         MockProvider      `yaml:"mock"`
}

// MockProvider tunes the built-in deterministic provider.
type MockProvider struct {
	Latency       time.Duration `yaml:"latency"`
	ChunkDelay    time.Duration `yaml:"chunk_delay"`
	FailStatus    int           `yaml:"fail_status"` // non-zero: always fail with this status
	EmbeddingDims int           `yaml:"embedding_dims"`
}

// Model maps a public alias onto one or more provider targets.
type Model struct {
	Alias          string         `yaml:"alias"`
	Kind           string         `yaml:"kind"` // chat|embedding
	Policy         string         `yaml:"policy"`
	Targets        []Target       `yaml:"targets"`
	Timeout        time.Duration  `yaml:"timeout"`
	Retry          Retry          `yaml:"retry"`
	Hedge          Hedge          `yaml:"hedge"`
	CircuitBreaker CircuitBreaker `yaml:"circuit_breaker"`
}

// Target is one concrete provider model behind an alias.
type Target struct {
	Provider          string  `yaml:"provider"`
	Model             string  `yaml:"model"`
	Weight            int     `yaml:"weight"`
	InputCostPerMTok  float64 `yaml:"input_cost_per_mtok"`
	OutputCostPerMTok float64 `yaml:"output_cost_per_mtok"`
}

// ID uniquely identifies a target across aliases (provider/model).
func (t Target) ID() string { return t.Provider + "/" + t.Model }

// Retry configures per-target retries with jittered exponential backoff.
type Retry struct {
	MaxAttempts int           `yaml:"max_attempts"`
	BaseBackoff time.Duration `yaml:"base_backoff"`
	MaxBackoff  time.Duration `yaml:"max_backoff"`
}

// Hedge enables a speculative second request after Delay.
type Hedge struct {
	Enabled bool          `yaml:"enabled"`
	Delay   time.Duration `yaml:"delay"`
}

// CircuitBreaker configures per-target breakers.
type CircuitBreaker struct {
	FailureThreshold int           `yaml:"failure_threshold"`
	OpenFor          time.Duration `yaml:"open_for"`
}

// Tenant is an isolated customer / business unit.
type Tenant struct {
	ID          string   `yaml:"id"`
	Name        string   `yaml:"name"`
	Keys        []APIKey `yaml:"keys"`
	TenantRules `yaml:",inline"`
}

// TenantRules holds the per-tenant governance policy.
type TenantRules struct {
	AllowedModels []string   `yaml:"allowed_models"`
	RateLimit     RateLimit  `yaml:"rate_limit"`
	Budget        Budget     `yaml:"budget"`
	Guardrails    Guardrails `yaml:"guardrails"`
	Cache         Cache      `yaml:"cache"`
}

// APIKey is a virtual key; only its SHA-256 is stored.
type APIKey struct {
	ID     string `yaml:"id"`
	SHA256 string `yaml:"sha256"`
}

// RateLimit configures token buckets (0 = unlimited).
type RateLimit struct {
	RequestsPerMinute int `yaml:"requests_per_minute"`
	TokensPerMinute   int `yaml:"tokens_per_minute"`
}

// Budget configures monthly spend limits (0 = unlimited).
type Budget struct {
	MonthlyTokens int64   `yaml:"monthly_tokens"`
	MonthlyUSD    float64 `yaml:"monthly_usd"`
	Mode          string  `yaml:"mode"` // hard|soft
	WarnRatio     float64 `yaml:"warn_ratio"`
}

// Guardrails configures data protection.
type Guardrails struct {
	PII                string   `yaml:"pii"` // off|redact|block
	PIITypes           []string `yaml:"pii_types"`
	ResponseRedaction  bool     `yaml:"response_redaction"`
	Injection          string   `yaml:"injection"` // off|flag|block
	InjectionThreshold float64  `yaml:"injection_threshold"`
}

// Cache configures exact and semantic caching.
type Cache struct {
	Enabled           *bool         `yaml:"enabled"`
	TTL               time.Duration `yaml:"ttl"`
	Semantic          *bool         `yaml:"semantic"`
	SemanticThreshold float64       `yaml:"semantic_threshold"`
}

// IsEnabled returns the effective exact-cache flag.
func (c Cache) IsEnabled() bool { return c.Enabled != nil && *c.Enabled }

// SemanticEnabled returns the effective semantic-cache flag.
func (c Cache) SemanticEnabled() bool { return c.IsEnabled() && c.Semantic != nil && *c.Semantic }

// Load reads, expands and validates a configuration file.
func Load(path string) (*Config, error) {
	b, err := os.ReadFile(path) //nolint:gosec // path is operator-provided
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	return Parse(b)
}

// Parse decodes a configuration document.
func Parse(b []byte) (*Config, error) {
	expanded := expandEnv(string(b))
	dec := yaml.NewDecoder(bytes.NewReader([]byte(expanded)))
	dec.KnownFields(true)
	var c Config
	if err := dec.Decode(&c); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	c.applyEnv()
	c.applyDefaults()
	if err := c.Validate(); err != nil {
		return nil, err
	}
	return &c, nil
}

var envRe = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)(:-([^}]*))?\}`)

func expandEnv(s string) string {
	return envRe.ReplaceAllStringFunc(s, func(m string) string {
		sm := envRe.FindStringSubmatch(m)
		if v, ok := os.LookupEnv(sm[1]); ok && v != "" {
			return v
		}
		return sm[3]
	})
}

func (c *Config) applyEnv() {
	if v := os.Getenv("GATEWAY_LISTEN_ADDR"); v != "" {
		c.Server.ListenAddr = v
	}
	if v := os.Getenv("GATEWAY_REDIS_URL"); v != "" {
		c.Redis.URL = v
	}
	if v := os.Getenv("GATEWAY_LOG_LEVEL"); v != "" {
		c.Telemetry.LogLevel = v
	}
	if v := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"); v != "" && c.Telemetry.OTLPEndpoint == "" {
		c.Telemetry.OTLPEndpoint = v
	}
}

func orDur(v *time.Duration, d time.Duration) {
	if *v <= 0 {
		*v = d
	}
}

func (c *Config) applyDefaults() {
	s := &c.Server
	if s.ListenAddr == "" {
		s.ListenAddr = ":8080"
	}
	orDur(&s.ReadHeaderTimeout, 5*time.Second)
	orDur(&s.RequestTimeout, 120*time.Second)
	orDur(&s.IdleTimeout, 120*time.Second)
	orDur(&s.ShutdownTimeout, 20*time.Second)
	if s.MaxBodyBytes <= 0 {
		s.MaxBodyBytes = 4 << 20
	}
	if c.Redis.KeyPrefix == "" {
		c.Redis.KeyPrefix = "llmgw:"
	}
	if c.Telemetry.ServiceName == "" {
		c.Telemetry.ServiceName = "llm-gateway"
	}
	if c.Telemetry.LogLevel == "" {
		c.Telemetry.LogLevel = "info"
	}
	if c.Telemetry.SampleRatio <= 0 {
		c.Telemetry.SampleRatio = 1
	}
	orDur(&c.HotReload.Interval, 5*time.Second)
	for i := range c.Providers {
		p := &c.Providers[i]
		orDur(&p.Timeout, 60*time.Second)
		if p.APIKeyHeader == "" {
			p.APIKeyHeader = "Authorization"
		}
		if p.Mock.EmbeddingDims <= 0 {
			p.Mock.EmbeddingDims = 256
		}
		p.BaseURL = strings.TrimRight(p.BaseURL, "/")
	}
	for i := range c.Models {
		m := &c.Models[i]
		if m.Kind == "" {
			m.Kind = "chat"
		}
		if m.Policy == "" {
			m.Policy = PolicyPriority
		}
		orDur(&m.Timeout, 60*time.Second)
		if m.Retry.MaxAttempts <= 0 {
			m.Retry.MaxAttempts = 2
		}
		orDur(&m.Retry.BaseBackoff, 100*time.Millisecond)
		orDur(&m.Retry.MaxBackoff, 2*time.Second)
		orDur(&m.Hedge.Delay, 500*time.Millisecond)
		if m.CircuitBreaker.FailureThreshold <= 0 {
			m.CircuitBreaker.FailureThreshold = 5
		}
		orDur(&m.CircuitBreaker.OpenFor, 30*time.Second)
		for j := range m.Targets {
			if m.Targets[j].Weight <= 0 {
				m.Targets[j].Weight = 1
			}
		}
	}
	applyRuleDefaults(&c.Defaults, TenantRules{})
	for i := range c.Tenants {
		applyRuleDefaults(&c.Tenants[i].TenantRules, c.Defaults)
	}
}

// applyRuleDefaults fills unset tenant fields from d, then from built-ins.
func applyRuleDefaults(r *TenantRules, d TenantRules) {
	if len(r.AllowedModels) == 0 {
		r.AllowedModels = d.AllowedModels
	}
	if r.RateLimit.RequestsPerMinute == 0 {
		r.RateLimit.RequestsPerMinute = d.RateLimit.RequestsPerMinute
	}
	if r.RateLimit.TokensPerMinute == 0 {
		r.RateLimit.TokensPerMinute = d.RateLimit.TokensPerMinute
	}
	b := &r.Budget
	if b.MonthlyTokens == 0 {
		b.MonthlyTokens = d.Budget.MonthlyTokens
	}
	if b.MonthlyUSD == 0 {
		b.MonthlyUSD = d.Budget.MonthlyUSD
	}
	if b.Mode == "" {
		b.Mode = firstNonEmpty(d.Budget.Mode, BudgetHard)
	}
	if b.WarnRatio == 0 {
		b.WarnRatio = d.Budget.WarnRatio
		if b.WarnRatio == 0 {
			b.WarnRatio = 0.8
		}
	}
	g := &r.Guardrails
	if g.PII == "" {
		g.PII = firstNonEmpty(d.Guardrails.PII, ActionRedact)
	}
	if len(g.PIITypes) == 0 {
		g.PIITypes = d.Guardrails.PIITypes
	}
	if !g.ResponseRedaction {
		g.ResponseRedaction = d.Guardrails.ResponseRedaction
	}
	if g.Injection == "" {
		g.Injection = firstNonEmpty(d.Guardrails.Injection, ActionBlock)
	}
	if g.InjectionThreshold == 0 {
		g.InjectionThreshold = d.Guardrails.InjectionThreshold
		if g.InjectionThreshold == 0 {
			g.InjectionThreshold = 0.7
		}
	}
	cc := &r.Cache
	if cc.Enabled == nil {
		cc.Enabled = d.Cache.Enabled
	}
	if cc.Semantic == nil {
		cc.Semantic = d.Cache.Semantic
	}
	if cc.TTL == 0 {
		cc.TTL = d.Cache.TTL
		if cc.TTL == 0 {
			cc.TTL = time.Hour
		}
	}
	if cc.SemanticThreshold == 0 {
		cc.SemanticThreshold = d.Cache.SemanticThreshold
		if cc.SemanticThreshold == 0 {
			cc.SemanticThreshold = 0.92
		}
	}
}

func firstNonEmpty(v ...string) string {
	for _, s := range v {
		if s != "" {
			return s
		}
	}
	return ""
}

var hexRe = regexp.MustCompile(`^[0-9a-f]{64}$`)

// Validate checks referential integrity and value ranges.
func (c *Config) Validate() error {
	var errs []error
	add := func(format string, a ...any) { errs = append(errs, fmt.Errorf(format, a...)) }

	providers := map[string]bool{}
	for _, p := range c.Providers {
		if p.Name == "" {
			add("providers: name is required")
		}
		if providers[p.Name] {
			add("providers: duplicate name %q", p.Name)
		}
		providers[p.Name] = true
		switch p.Type {
		case "mock":
		case "openai":
			if p.BaseURL == "" {
				add("provider %q: base_url is required", p.Name)
			}
		default:
			add("provider %q: unknown type %q (want openai|mock)", p.Name, p.Type)
		}
	}
	aliases := map[string]string{}
	for _, m := range c.Models {
		if m.Alias == "" {
			add("models: alias is required")
		}
		if _, dup := aliases[m.Alias]; dup {
			add("models: duplicate alias %q", m.Alias)
		}
		aliases[m.Alias] = m.Kind
		if m.Kind != "chat" && m.Kind != "embedding" {
			add("model %q: kind must be chat or embedding", m.Alias)
		}
		if !slices.Contains([]string{PolicyPriority, PolicyWeighted, PolicyCost, PolicyLatency}, m.Policy) {
			add("model %q: unknown policy %q", m.Alias, m.Policy)
		}
		if len(m.Targets) == 0 {
			add("model %q: at least one target is required", m.Alias)
		}
		for _, t := range m.Targets {
			if !providers[t.Provider] {
				add("model %q: unknown provider %q", m.Alias, t.Provider)
			}
			if t.Model == "" {
				add("model %q: target model is required", m.Alias)
			}
			if t.InputCostPerMTok < 0 || t.OutputCostPerMTok < 0 {
				add("model %q: costs must be >= 0", m.Alias)
			}
		}
	}
	if c.Embeddings.Alias != "" && aliases[c.Embeddings.Alias] != "embedding" {
		add("embeddings.alias %q must reference an embedding model", c.Embeddings.Alias)
	}
	if c.Admin.APIKeySHA256 != "" && !hexRe.MatchString(c.Admin.APIKeySHA256) {
		add("admin.api_key_sha256 must be 64 lowercase hex chars")
	}
	tenants := map[string]bool{}
	keys := map[string]string{}
	for _, t := range c.Tenants {
		if t.ID == "" {
			add("tenants: id is required")
		}
		if tenants[t.ID] {
			add("tenants: duplicate id %q", t.ID)
		}
		tenants[t.ID] = true
		for _, k := range t.Keys {
			if !hexRe.MatchString(k.SHA256) {
				add("tenant %q key %q: sha256 must be 64 lowercase hex chars", t.ID, k.ID)
			}
			if other, dup := keys[k.SHA256]; dup {
				add("tenant %q: key also assigned to tenant %q", t.ID, other)
			}
			keys[k.SHA256] = t.ID
		}
		errs = append(errs, validateRules("tenant "+t.ID, t.TenantRules)...)
	}
	return errors.Join(errs...)
}

func validateRules(where string, r TenantRules) []error {
	var errs []error
	if r.Budget.Mode != BudgetHard && r.Budget.Mode != BudgetSoft {
		errs = append(errs, fmt.Errorf("%s: budget.mode must be hard or soft", where))
	}
	if r.Budget.WarnRatio < 0 || r.Budget.WarnRatio > 1 {
		errs = append(errs, fmt.Errorf("%s: budget.warn_ratio must be in [0,1]", where))
	}
	if !slices.Contains([]string{ActionOff, ActionRedact, ActionBlock}, r.Guardrails.PII) {
		errs = append(errs, fmt.Errorf("%s: guardrails.pii must be off|redact|block", where))
	}
	if !slices.Contains([]string{ActionOff, ActionFlag, ActionBlock}, r.Guardrails.Injection) {
		errs = append(errs, fmt.Errorf("%s: guardrails.injection must be off|flag|block", where))
	}
	if t := r.Cache.SemanticThreshold; t <= 0 || t > 1 {
		errs = append(errs, fmt.Errorf("%s: cache.semantic_threshold must be in (0,1]", where))
	}
	if r.RateLimit.RequestsPerMinute < 0 || r.RateLimit.TokensPerMinute < 0 {
		errs = append(errs, fmt.Errorf("%s: rate limits must be >= 0", where))
	}
	return errs
}

// ModelByAlias returns the model with the given alias.
func (c *Config) ModelByAlias(alias string) (Model, bool) {
	for _, m := range c.Models {
		if m.Alias == alias {
			return m, true
		}
	}
	return Model{}, false
}
