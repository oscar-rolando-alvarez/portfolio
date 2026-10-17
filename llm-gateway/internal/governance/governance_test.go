package governance

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/adapters/memstore"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/config"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

type events struct{ rate, budget []string }

func (e *events) RateLimited(_, l string)  { e.rate = append(e.rate, l) }
func (e *events) BudgetEvent(_, ev string) { e.budget = append(e.budget, ev) }

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

func TestAuthenticate(t *testing.T) {
	tenants := []config.Tenant{{ID: "a", Keys: []config.APIKey{{ID: "k1", SHA256: HashKey("secret")}}}}
	a := NewAuthenticator(tenants)
	p, err := a.Authenticate("secret")
	if err != nil || p.Tenant.ID != "a" || p.KeyID != "k1" {
		t.Fatalf("p=%+v err=%v", p, err)
	}
	for _, bad := range []string{"", "nope", "SECRET"} {
		if _, err := a.Authenticate(bad); err == nil {
			t.Fatalf("%q must fail", bad)
		}
	}
}

func TestModelAllowed(t *testing.T) {
	tn := &config.Tenant{TenantRules: config.TenantRules{AllowedModels: []string{"chat-*", "embed"}}}
	for alias, want := range map[string]bool{"chat-fast": true, "embed": true, "premium": false, "embed-2": false} {
		if got := ModelAllowed(tn, alias); got != want {
			t.Errorf("%s: got %v", alias, got)
		}
	}
	if !ModelAllowed(&config.Tenant{}, "anything") {
		t.Fatal("empty allow-list permits all")
	}
}

func TestCheckRate(t *testing.T) {
	ev := &events{}
	g := NewGovernor(memstore.NewRateLimiter(nil), memstore.NewUsageStore(), ev, quiet, nil)
	tn := &config.Tenant{ID: "t", TenantRules: config.TenantRules{RateLimit: config.RateLimit{RequestsPerMinute: 1, TokensPerMinute: 100}}}
	ctx := context.Background()
	if err := g.CheckRate(ctx, tn, 50); err != nil {
		t.Fatal(err)
	}
	err := g.CheckRate(ctx, tn, 10)
	var ge *core.Error
	if !errors.As(err, &ge) || ge.Status != http.StatusTooManyRequests || ge.RetryAfter <= 0 {
		t.Fatalf("err=%v", err)
	}
	tn2 := &config.Tenant{ID: "t2", TenantRules: config.TenantRules{RateLimit: config.RateLimit{TokensPerMinute: 100}}}
	if err := g.CheckRate(ctx, tn2, 500); err == nil {
		t.Fatal("request larger than the per-minute token limit must be rejected")
	}
	if len(ev.rate) != 2 {
		t.Fatalf("events=%v", ev.rate)
	}
}

type failingLimiter struct{}

func (failingLimiter) Take(context.Context, string, float64, float64, float64, bool) (core.Decision, error) {
	return core.Decision{}, errors.New("redis down")
}

func TestRateFailsOpen(t *testing.T) {
	g := NewGovernor(failingLimiter{}, memstore.NewUsageStore(), &events{}, quiet, nil)
	tn := &config.Tenant{ID: "t", TenantRules: config.TenantRules{RateLimit: config.RateLimit{RequestsPerMinute: 1}}}
	if err := g.CheckRate(context.Background(), tn, 1); err != nil {
		t.Fatalf("limiter outage must fail open: %v", err)
	}
}

func TestBudgets(t *testing.T) {
	now := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	us := memstore.NewUsageStore()
	ev := &events{}
	g := NewGovernor(memstore.NewRateLimiter(nil), us, ev, quiet, func() time.Time { return now })
	ctx := context.Background()
	hard := &config.Tenant{ID: "h", TenantRules: config.TenantRules{Budget: config.Budget{MonthlyUSD: 1, Mode: config.BudgetHard, WarnRatio: 0.8}}}

	g.Record(ctx, core.UsageRecord{Tenant: "h", CostNanos: 850_000_000}) // $0.85
	st, err := g.CheckBudget(ctx, hard)
	if err != nil || !st.Warning {
		t.Fatalf("expected warning at 85%%: %+v %v", st, err)
	}
	g.Record(ctx, core.UsageRecord{Tenant: "h", CostNanos: 200_000_000})
	if _, err := g.CheckBudget(ctx, hard); err == nil {
		t.Fatal("hard budget must reject when exhausted")
	}
	soft := &config.Tenant{ID: "h", TenantRules: config.TenantRules{Budget: config.Budget{MonthlyUSD: 1, Mode: config.BudgetSoft}}}
	if st, err := g.CheckBudget(ctx, soft); err != nil || !st.Warning {
		t.Fatalf("soft budget must warn, not reject: %+v %v", st, err)
	}
	// A new month starts from zero.
	now = now.AddDate(0, 1, 0)
	if st, err := g.CheckBudget(ctx, hard); err != nil || st.Warning {
		t.Fatalf("new period: %+v %v", st, err)
	}
	if Period(now) != "2026-11" {
		t.Fatal(Period(now))
	}
}
