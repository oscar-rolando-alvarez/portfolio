package config

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

const minimal = `
providers:
  - { name: p, type: mock }
models:
  - alias: chat
    targets: [{ provider: p, model: m }]
tenants:
  - id: t1
    keys: [{ id: k, sha256: ${KEY_HASH:-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa} }]
`

func TestParseDefaults(t *testing.T) {
	c, err := Parse([]byte(minimal))
	if err != nil {
		t.Fatal(err)
	}
	if c.Server.ListenAddr != ":8080" || c.Models[0].Policy != PolicyPriority || c.Models[0].Retry.MaxAttempts != 2 {
		t.Fatalf("defaults not applied: %+v", c.Models[0])
	}
	tn := c.Tenants[0]
	if tn.Guardrails.PII != ActionRedact || tn.Guardrails.Injection != ActionBlock || tn.Budget.Mode != BudgetHard {
		t.Fatalf("tenant defaults: %+v", tn.TenantRules)
	}
	if tn.Cache.IsEnabled() || tn.Cache.TTL != time.Hour {
		t.Fatalf("cache defaults: %+v", tn.Cache)
	}
}

func TestEnvExpansionAndOverrides(t *testing.T) {
	t.Setenv("KEY_HASH", strings.Repeat("b", 64))
	t.Setenv("GATEWAY_REDIS_URL", "redis://r:6379/0")
	c, err := Parse([]byte(minimal))
	if err != nil {
		t.Fatal(err)
	}
	if c.Tenants[0].Keys[0].SHA256 != strings.Repeat("b", 64) || c.Redis.URL != "redis://r:6379/0" {
		t.Fatalf("env not applied: %+v %+v", c.Tenants[0].Keys, c.Redis)
	}
}

func TestTenantInheritsDefaults(t *testing.T) {
	doc := minimal + `
tenant_defaults:
  rate_limit: { requests_per_minute: 10 }
  cache: { enabled: true, semantic: true }
`
	c, err := Parse([]byte(doc))
	if err != nil {
		t.Fatal(err)
	}
	tn := c.Tenants[0]
	if tn.RateLimit.RequestsPerMinute != 10 || !tn.Cache.SemanticEnabled() {
		t.Fatalf("inheritance failed: %+v", tn.TenantRules)
	}
}

func TestValidationErrors(t *testing.T) {
	cases := map[string]string{
		"unknown provider": `
providers: [{ name: p, type: mock }]
models: [{ alias: a, targets: [{ provider: nope, model: m }] }]`,
		"bad policy": `
providers: [{ name: p, type: mock }]
models: [{ alias: a, policy: random, targets: [{ provider: p, model: m }] }]`,
		"bad key hash": `
providers: [{ name: p, type: mock }]
tenants: [{ id: t, keys: [{ id: k, sha256: plaintext-key }] }]`,
		"openai without url": `
providers: [{ name: p, type: openai }]`,
		"unknown field": `
providerz: []`,
		"bad pii action": `
tenants: [{ id: t, guardrails: { pii: maybe } }]`,
		"embeddings alias not embedding": `
providers: [{ name: p, type: mock }]
models: [{ alias: a, targets: [{ provider: p, model: m }] }]
embeddings: { alias: a }`,
	}
	for name, doc := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := Parse([]byte(doc)); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestShippedConfigsAreValid(t *testing.T) {
	_, file, _, _ := runtime.Caller(0)
	root := filepath.Join(filepath.Dir(file), "..", "..")
	matches, _ := filepath.Glob(filepath.Join(root, "configs", "*.yaml"))
	if len(matches) == 0 {
		t.Fatal("no configs found")
	}
	t.Setenv("OPENAI_API_KEY", "sk-test")
	for _, m := range matches {
		if _, err := Load(m); err != nil {
			t.Errorf("%s: %v", filepath.Base(m), err)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "configs", "gateway.yaml")); err != nil {
		t.Fatal(err)
	}
}
