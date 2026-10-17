// Package governance implements multi-tenant controls: virtual API key
// authentication, model entitlements, request/token rate limits and monthly
// token/cost budgets.
package governance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"math"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/config"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

// Principal is an authenticated caller.
type Principal struct {
	Tenant *config.Tenant
	KeyID  string
}

// HashKey returns the hex SHA-256 used to store virtual keys.
func HashKey(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// Authenticator resolves virtual API keys to tenants. Only key hashes are
// held in memory; plaintext keys never appear in configuration.
type Authenticator struct {
	byHash map[string]Principal
}

// NewAuthenticator indexes the tenants' keys.
func NewAuthenticator(tenants []config.Tenant) *Authenticator {
	a := &Authenticator{byHash: map[string]Principal{}}
	for i := range tenants {
		t := &tenants[i]
		for _, k := range t.Keys {
			a.byHash[k.SHA256] = Principal{Tenant: t, KeyID: k.ID}
		}
	}
	return a
}

// Authenticate validates a bearer token.
func (a *Authenticator) Authenticate(token string) (Principal, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return Principal{}, core.Errorf(http.StatusUnauthorized, core.CodeAuthentication, "missing API key")
	}
	p, ok := a.byHash[HashKey(token)]
	if !ok {
		return Principal{}, core.Errorf(http.StatusUnauthorized, core.CodeAuthentication, "invalid API key")
	}
	return p, nil
}

// ModelAllowed reports whether a tenant may use a model alias. Patterns
// support shell globs (e.g. "chat-*"); an empty list allows everything.
func ModelAllowed(t *config.Tenant, alias string) bool {
	if len(t.AllowedModels) == 0 {
		return true
	}
	for _, p := range t.AllowedModels {
		if p == "*" || p == alias {
			return true
		}
		if ok, _ := path.Match(p, alias); ok {
			return true
		}
	}
	return false
}

// Period returns the budget period (calendar month, UTC).
func Period(t time.Time) string { return t.UTC().Format("2006-01") }

// Events receives governance outcomes (implemented by telemetry).
type Events interface {
	RateLimited(tenant, limit string)
	BudgetEvent(tenant, event string)
}

// Governor enforces rate limits and budgets.
type Governor struct {
	limiter core.RateLimiter
	usage   core.UsageStore
	events  Events
	log     *slog.Logger
	now     func() time.Time
}

// NewGovernor creates a governor.
func NewGovernor(l core.RateLimiter, u core.UsageStore, ev Events, log *slog.Logger, now func() time.Time) *Governor {
	if now == nil {
		now = time.Now
	}
	return &Governor{limiter: l, usage: u, events: ev, log: log, now: now}
}

// Usage exposes the usage store for reports.
func (g *Governor) Usage() core.UsageStore { return g.usage }

// Now returns the governor clock.
func (g *Governor) Now() time.Time { return g.now() }

func rateLimited(limit string, retry time.Duration) *core.Error {
	e := core.Errorf(http.StatusTooManyRequests, core.CodeRateLimited, "tenant %s per-minute limit exceeded", limit)
	e.RetryAfter = retry
	return e
}

// CheckRate consumes one request and estTokens tokens from the tenant's
// buckets. The store failing open is a deliberate availability choice: a
// Redis outage degrades governance, it does not take down model traffic.
func (g *Governor) CheckRate(ctx context.Context, t *config.Tenant, estTokens int) error {
	rl := t.RateLimit
	if rl.RequestsPerMinute > 0 {
		rpm := float64(rl.RequestsPerMinute)
		d, err := g.limiter.Take(ctx, "req:"+t.ID, 1, rpm/60, rpm, false)
		if err != nil {
			g.log.WarnContext(ctx, "rate limiter unavailable, failing open", "err", err, "tenant", t.ID)
		} else if !d.Allowed {
			g.events.RateLimited(t.ID, "requests")
			return rateLimited("requests", d.RetryAfter)
		}
	}
	if rl.TokensPerMinute > 0 && estTokens > 0 {
		tpm := float64(rl.TokensPerMinute)
		if float64(estTokens) > tpm {
			g.events.RateLimited(t.ID, "tokens")
			return core.Errorf(http.StatusBadRequest, core.CodeRateLimited,
				"request needs ~%d tokens which exceeds the tenant limit of %d tokens/minute", estTokens, rl.TokensPerMinute)
		}
		d, err := g.limiter.Take(ctx, "tok:"+t.ID, float64(estTokens), tpm/60, tpm, false)
		if err != nil {
			g.log.WarnContext(ctx, "rate limiter unavailable, failing open", "err", err, "tenant", t.ID)
		} else if !d.Allowed {
			g.events.RateLimited(t.ID, "tokens")
			return rateLimited("tokens", d.RetryAfter)
		}
	}
	return nil
}

// Reconcile charges the difference between actual and estimated tokens so
// the token bucket reflects real consumption.
func (g *Governor) Reconcile(ctx context.Context, t *config.Tenant, estTokens, actualTokens int) {
	diff := actualTokens - estTokens
	if t.RateLimit.TokensPerMinute <= 0 || diff <= 0 {
		return
	}
	tpm := float64(t.RateLimit.TokensPerMinute)
	if _, err := g.limiter.Take(ctx, "tok:"+t.ID, float64(diff), tpm/60, tpm, true); err != nil {
		g.log.WarnContext(ctx, "token reconcile failed", "err", err, "tenant", t.ID)
	}
}

// BudgetStatus is the result of a budget check.
type BudgetStatus struct {
	Warning     bool
	UsedRatio   float64
	TokensUsed  int64
	CostUSDUsed float64
}

// CheckBudget evaluates the tenant's monthly budget. Hard budgets reject
// once exhausted; soft budgets only warn. Because the check runs before the
// request, concurrent in-flight requests can overshoot by at most their own
// cost; this is the standard trade-off versus a reservation protocol.
func (g *Governor) CheckBudget(ctx context.Context, t *config.Tenant) (BudgetStatus, error) {
	b := t.Budget
	var st BudgetStatus
	if b.MonthlyTokens <= 0 && b.MonthlyUSD <= 0 {
		return st, nil
	}
	u, err := g.usage.Get(ctx, t.ID, Period(g.now()))
	if err != nil {
		g.log.WarnContext(ctx, "usage store unavailable, failing open", "err", err, "tenant", t.ID)
		return st, nil
	}
	st.TokensUsed, st.CostUSDUsed = u.TotalTokens, u.CostUSD
	if b.MonthlyTokens > 0 {
		st.UsedRatio = math.Max(st.UsedRatio, float64(u.TotalTokens)/float64(b.MonthlyTokens))
	}
	if b.MonthlyUSD > 0 {
		st.UsedRatio = math.Max(st.UsedRatio, u.CostUSD/b.MonthlyUSD)
	}
	if st.UsedRatio >= 1 {
		if b.Mode == config.BudgetHard {
			g.events.BudgetEvent(t.ID, "rejected")
			e := core.Errorf(http.StatusTooManyRequests, core.CodeBudgetExceeded,
				"monthly budget exhausted for tenant %s (%.0f%% used)", t.ID, st.UsedRatio*100)
			e.Type = "insufficient_quota"
			return st, e
		}
		st.Warning = true
		g.events.BudgetEvent(t.ID, "over_soft_limit")
		return st, nil
	}
	if b.WarnRatio > 0 && st.UsedRatio >= b.WarnRatio {
		st.Warning = true
		g.events.BudgetEvent(t.ID, "warning")
	}
	return st, nil
}

// Record persists usage for budgets and reports.
func (g *Governor) Record(ctx context.Context, rec core.UsageRecord) {
	if rec.Period == "" {
		rec.Period = Period(g.now())
	}
	if err := g.usage.Record(ctx, rec); err != nil {
		g.log.ErrorContext(ctx, "usage record failed", "err", err, "tenant", rec.Tenant)
	}
}
