// Package evals is the offline regression harness: it drives a gateway
// over real HTTP with a golden dataset and computes routing, fallback,
// data-protection, cache and governance metrics gated by thresholds.
package evals

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"regexp"
	"slices"
	"sort"
	"strings"
	"time"

	"go.yaml.in/yaml/v3"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/config"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/governance"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/guardrails"
)

// Threshold bounds a metric.
type Threshold struct {
	Min *float64 `yaml:"min"`
	Max *float64 `yaml:"max"`
}

// Dataset is the golden file.
type Dataset struct {
	Thresholds map[string]Threshold `yaml:"thresholds"`
	Routing    []RoutingCase        `yaml:"routing"`
	Weighted   []WeightedCase       `yaml:"weighted"`
	Fallback   []FallbackCase       `yaml:"fallback"`
	PII        []PIICase            `yaml:"pii"`
	Injection  []InjectionCase      `yaml:"injection"`
	Cache      []CacheSequence      `yaml:"cache"`
	Governance []GovernanceCase     `yaml:"governance"`
}

// RoutingCase checks which target serves an alias.
type RoutingCase struct {
	Name           string `yaml:"name"`
	Model          string `yaml:"model"`
	ExpectProvider string `yaml:"expect_provider"`
	ExpectModel    string `yaml:"expect_model"`
}

// WeightedCase checks the traffic split of a weighted alias.
type WeightedCase struct {
	Name        string             `yaml:"name"`
	Model       string             `yaml:"model"`
	Requests    int                `yaml:"requests"`
	ExpectShare map[string]float64 `yaml:"expect_share"`
}

// FallbackCase checks resilience behaviour.
type FallbackCase struct {
	Name           string `yaml:"name"`
	Model          string `yaml:"model"`
	Prompt         string `yaml:"prompt"`
	Stream         bool   `yaml:"stream"`
	ExpectStatus   int    `yaml:"expect_status"`
	ExpectProvider string `yaml:"expect_provider"`
	ExpectCode     string `yaml:"expect_code"`
	MinFallbacks   *int   `yaml:"min_fallbacks"`
	MaxFallbacks   *int   `yaml:"max_fallbacks"`
}

// PIICase checks redaction of one text.
type PIICase struct {
	Text   string         `yaml:"text"`
	Expect map[string]int `yaml:"expect"`
	Values []string       `yaml:"values"`
}

// InjectionCase is a labelled prompt.
type InjectionCase struct {
	Text   string `yaml:"text"`
	Attack bool   `yaml:"attack"`
}

// CacheSequence is an ordered list of prompts with expected cache results.
type CacheSequence struct {
	Name  string      `yaml:"name"`
	Steps []CacheStep `yaml:"steps"`
}

// CacheStep is one prompt in a cache sequence.
type CacheStep struct {
	Prompt string `yaml:"prompt"`
	Expect string `yaml:"expect"`
}

// GovernanceCase sends N requests and checks the status sequence.
type GovernanceCase struct {
	Name           string `yaml:"name"`
	Tenant         string `yaml:"tenant"`
	Model          string `yaml:"model"`
	Requests       int    `yaml:"requests"`
	ExpectStatuses []int  `yaml:"expect_statuses"`
}

// LoadDataset reads a golden file.
func LoadDataset(path string) (*Dataset, error) {
	b, err := os.ReadFile(path) //nolint:gosec // operator-provided path
	if err != nil {
		return nil, err
	}
	var d Dataset
	dec := yaml.NewDecoder(strings.NewReader(string(b)))
	dec.KnownFields(true)
	if err := dec.Decode(&d); err != nil {
		return nil, fmt.Errorf("parse dataset: %w", err)
	}
	return &d, nil
}

// TenantKey is the API key the harness injects for a tenant.
func TenantKey(tenantID string) string { return "eval-" + tenantID }

// InjectKeys gives every tenant a deterministic eval key.
func InjectKeys(cfg *config.Config) {
	for i := range cfg.Tenants {
		cfg.Tenants[i].Keys = []config.APIKey{{ID: "eval", SHA256: governance.HashKey(TenantKey(cfg.Tenants[i].ID))}}
	}
}

// Failure describes one failing case.
type Failure struct {
	Suite  string `json:"suite"`
	Case   string `json:"case"`
	Detail string `json:"detail"`
}

// Report is the harness output.
type Report struct {
	Metrics  map[string]float64 `json:"metrics"`
	Cases    map[string]int     `json:"cases"`
	Failures []Failure          `json:"failures"`
	Gate     []GateResult       `json:"gate"`
	Passed   bool               `json:"passed"`
	Duration string             `json:"duration"`
}

// GateResult is the threshold evaluation of one metric.
type GateResult struct {
	Metric string  `json:"metric"`
	Value  float64 `json:"value"`
	Bound  string  `json:"bound"`
	Pass   bool    `json:"pass"`
}

// Runner executes suites against a gateway base URL.
type Runner struct {
	BaseURL string
	Client  *http.Client
	Suites  []string // empty = all
}

func (r *Runner) enabled(s string) bool { return len(r.Suites) == 0 || slices.Contains(r.Suites, s) }

type result struct {
	status    int
	provider  string
	upstream  string
	cache     string
	fallbacks int
	content   string
	code      string
}

func (r *Runner) chat(ctx context.Context, tenant, model, prompt string, stream bool) (result, error) {
	body := map[string]any{"model": model, "messages": []map[string]string{{"role": "user", "content": prompt}}}
	if stream {
		body["stream"] = true
	}
	b, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.BaseURL+"/v1/chat/completions", strings.NewReader(string(b)))
	if err != nil {
		return result{}, err
	}
	req.Header.Set("Authorization", "Bearer "+TenantKey(tenant))
	req.Header.Set("Content-Type", "application/json")
	resp, err := r.Client.Do(req)
	if err != nil {
		return result{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	res := result{
		status: resp.StatusCode, provider: resp.Header.Get("X-Gateway-Provider"),
		upstream: resp.Header.Get("X-Gateway-Upstream-Model"), cache: resp.Header.Get("X-Gateway-Cache"),
	}
	_, _ = fmt.Sscan(resp.Header.Get("X-Gateway-Fallbacks"), &res.fallbacks)
	if resp.StatusCode != http.StatusOK {
		var e struct {
			Error struct{ Code string } `json:"error"`
		}
		raw, _ := io.ReadAll(resp.Body)
		_ = json.Unmarshal(raw, &e)
		res.code = e.Error.Code
		return res, nil
	}
	if stream {
		sc := bufio.NewScanner(resp.Body)
		var sb strings.Builder
		for sc.Scan() {
			data, ok := strings.CutPrefix(sc.Text(), "data: ")
			if !ok || data == "[DONE]" {
				continue
			}
			var c core.ChatChunk
			if json.Unmarshal([]byte(data), &c) == nil {
				for _, ch := range c.Choices {
					sb.WriteString(ch.Delta.Content)
				}
			}
		}
		res.content = sb.String()
		return res, nil
	}
	var cr core.ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&cr); err != nil {
		return res, err
	}
	if len(cr.Choices) > 0 {
		res.content = cr.Choices[0].Message.Content.String()
	}
	return res, nil
}

// Run executes the dataset and evaluates thresholds.
func (r *Runner) Run(ctx context.Context, d *Dataset) (*Report, error) {
	start := time.Now()
	rep := &Report{Metrics: map[string]float64{}, Cases: map[string]int{}}
	fail := func(suite, name, format string, a ...any) {
		rep.Failures = append(rep.Failures, Failure{Suite: suite, Case: name, Detail: fmt.Sprintf(format, a...)})
	}
	steps := []struct {
		name string
		fn   func(context.Context, *Dataset, *Report, func(string, string, string, ...any)) error
	}{
		{"routing", r.runRouting}, {"fallback", r.runFallback}, {"pii", r.runPII},
		{"injection", r.runInjection}, {"cache", r.runCache}, {"governance", r.runGovernance},
	}
	for _, s := range steps {
		if !r.enabled(s.name) {
			continue
		}
		if err := s.fn(ctx, d, rep, fail); err != nil {
			return nil, fmt.Errorf("%s suite: %w", s.name, err)
		}
	}
	rep.Passed = true
	names := make([]string, 0, len(d.Thresholds))
	for k := range d.Thresholds {
		names = append(names, k)
	}
	sort.Strings(names)
	for _, name := range names {
		th := d.Thresholds[name]
		v, ok := rep.Metrics[name]
		if !ok {
			continue // suite not selected
		}
		g := GateResult{Metric: name, Value: v, Pass: true}
		if th.Min != nil {
			g.Bound = fmt.Sprintf(">= %.2f", *th.Min)
			g.Pass = v >= *th.Min-1e-9
		}
		if th.Max != nil {
			g.Bound = fmt.Sprintf("<= %.2f", *th.Max)
			g.Pass = g.Pass && v <= *th.Max+1e-9
		}
		rep.Passed = rep.Passed && g.Pass
		rep.Gate = append(rep.Gate, g)
	}
	rep.Duration = time.Since(start).Round(time.Millisecond).String()
	return rep, nil
}

const guardedTenant, cachedTenant = "guarded", "cached"

func (r *Runner) runRouting(ctx context.Context, d *Dataset, rep *Report, fail func(string, string, string, ...any)) error {
	ok := 0
	for _, c := range d.Routing {
		res, err := r.chat(ctx, guardedTenant, c.Model, "routing check "+c.Name, false)
		if err != nil {
			return err
		}
		if res.status == http.StatusOK && res.provider == c.ExpectProvider && (c.ExpectModel == "" || res.upstream == c.ExpectModel) {
			ok++
		} else {
			fail("routing", c.Name, "got status=%d provider=%s model=%s", res.status, res.provider, res.upstream)
		}
	}
	rep.Cases["routing"] = len(d.Routing)
	rep.Metrics["routing_accuracy"] = ratio(ok, len(d.Routing))

	worst := 0.0
	for _, c := range d.Weighted {
		counts := map[string]int{}
		for i := range c.Requests {
			res, err := r.chat(ctx, guardedTenant, c.Model, fmt.Sprintf("weighted %d", i), false)
			if err != nil {
				return err
			}
			counts[res.provider]++
		}
		for p, want := range c.ExpectShare {
			got := float64(counts[p]) / float64(c.Requests)
			if e := math.Abs(got - want); e > worst {
				worst = e
			}
		}
	}
	if len(d.Weighted) > 0 {
		rep.Cases["weighted"] = len(d.Weighted)
		rep.Metrics["weighted_share_error"] = worst
	}
	return nil
}

func (r *Runner) runFallback(ctx context.Context, d *Dataset, rep *Report, fail func(string, string, string, ...any)) error {
	ok := 0
	for _, c := range d.Fallback {
		res, err := r.chat(ctx, guardedTenant, c.Model, c.Prompt, c.Stream)
		if err != nil {
			return err
		}
		var problems []string
		if res.status != c.ExpectStatus {
			problems = append(problems, fmt.Sprintf("status=%d want %d", res.status, c.ExpectStatus))
		}
		if c.ExpectProvider != "" && res.provider != c.ExpectProvider {
			problems = append(problems, fmt.Sprintf("provider=%s want %s", res.provider, c.ExpectProvider))
		}
		if c.ExpectCode != "" && res.code != c.ExpectCode {
			problems = append(problems, fmt.Sprintf("code=%s want %s", res.code, c.ExpectCode))
		}
		if c.MinFallbacks != nil && res.fallbacks < *c.MinFallbacks {
			problems = append(problems, fmt.Sprintf("fallbacks=%d want >= %d", res.fallbacks, *c.MinFallbacks))
		}
		if c.MaxFallbacks != nil && res.fallbacks > *c.MaxFallbacks {
			problems = append(problems, fmt.Sprintf("fallbacks=%d want <= %d", res.fallbacks, *c.MaxFallbacks))
		}
		if len(problems) == 0 {
			ok++
		} else {
			fail("fallback", c.Name, "%s", strings.Join(problems, "; "))
		}
	}
	rep.Cases["fallback"] = len(d.Fallback)
	rep.Metrics["fallback_accuracy"] = ratio(ok, len(d.Fallback))
	return nil
}

var placeholderRe = regexp.MustCompile(`\[REDACTED:([A-Z_]+)\]`)

// runPII relies on the mock provider echoing the prompt it received, so the
// metrics measure what actually reached the upstream.
func (r *Runner) runPII(ctx context.Context, d *Dataset, rep *Report, fail func(string, string, string, ...any)) error {
	var tp, fp, fn, leaks, values int
	for _, c := range d.PII {
		res, err := r.chat(ctx, guardedTenant, "chat-priority", c.Text, false)
		if err != nil {
			return err
		}
		if res.status != http.StatusOK {
			fail("pii", c.Text, "status=%d code=%s", res.status, res.code)
			fn += total(c.Expect)
			continue
		}
		found := map[string]int{}
		for _, m := range placeholderRe.FindAllStringSubmatch(res.content, -1) {
			found[strings.ToLower(m[1])]++
		}
		for _, typ := range guardrails.AllPIITypes {
			want, got := c.Expect[typ], found[typ]
			hit := min(want, got)
			tp += hit
			fp += got - hit
			fn += want - hit
			if got != want {
				fail("pii", c.Text, "%s: redacted %d want %d", typ, got, want)
			}
		}
		for _, v := range c.Values {
			values++
			if strings.Contains(res.content, v) {
				leaks++
				fail("pii", c.Text, "raw value %q reached upstream", v)
			}
		}
	}
	rep.Cases["pii"] = len(d.PII)
	rep.Metrics["pii_precision"] = ratio(tp, tp+fp)
	rep.Metrics["pii_recall"] = ratio(tp, tp+fn)
	rep.Metrics["pii_leak_rate"] = ratioOrZero(leaks, values)
	return nil
}

func (r *Runner) runInjection(ctx context.Context, d *Dataset, rep *Report, fail func(string, string, string, ...any)) error {
	var tp, fn, fp, tn int
	for _, c := range d.Injection {
		res, err := r.chat(ctx, guardedTenant, "chat-priority", c.Text, false)
		if err != nil {
			return err
		}
		blocked := res.status == http.StatusBadRequest && res.code == core.CodeInjectionBlocked
		switch {
		case c.Attack && blocked:
			tp++
		case c.Attack:
			fn++
			fail("injection", c.Text, "attack not blocked (status %d)", res.status)
		case blocked:
			fp++
			fail("injection", c.Text, "benign prompt blocked")
		default:
			tn++
		}
	}
	rep.Cases["injection"] = len(d.Injection)
	rep.Metrics["injection_tpr"] = ratio(tp, tp+fn)
	rep.Metrics["injection_fpr"] = ratioOrZero(fp, fp+tn)
	return nil
}

func (r *Runner) runCache(ctx context.Context, d *Dataset, rep *Report, fail func(string, string, string, ...any)) error {
	var ok, n, falseHits, expectedMisses int
	for _, seq := range d.Cache {
		for i, s := range seq.Steps {
			res, err := r.chat(ctx, cachedTenant, "chat-priority", s.Prompt, false)
			if err != nil {
				return err
			}
			n++
			if s.Expect == "miss" {
				expectedMisses++
				if res.cache == "exact" || res.cache == "semantic" {
					falseHits++
				}
			}
			if res.cache == s.Expect {
				ok++
			} else {
				fail("cache", fmt.Sprintf("%s#%d", seq.Name, i), "cache=%s want %s", res.cache, s.Expect)
			}
		}
	}
	rep.Cases["cache"] = n
	rep.Metrics["cache_accuracy"] = ratio(ok, n)
	rep.Metrics["cache_false_hit_rate"] = ratioOrZero(falseHits, expectedMisses)
	return nil
}

func (r *Runner) runGovernance(ctx context.Context, d *Dataset, rep *Report, fail func(string, string, string, ...any)) error {
	ok := 0
	for _, c := range d.Governance {
		var got []int
		for range c.Requests {
			res, err := r.chat(ctx, c.Tenant, c.Model, "governance check", false)
			if err != nil {
				return err
			}
			got = append(got, res.status)
		}
		if slices.Equal(got, c.ExpectStatuses) {
			ok++
		} else {
			fail("governance", c.Name, "statuses=%v want %v", got, c.ExpectStatuses)
		}
	}
	rep.Cases["governance"] = len(d.Governance)
	rep.Metrics["governance_accuracy"] = ratio(ok, len(d.Governance))
	return nil
}

func total(m map[string]int) int {
	n := 0
	for _, v := range m {
		n += v
	}
	return n
}

// ratio returns a/b, treating an empty denominator as perfect (1.0).
func ratio(a, b int) float64 {
	if b == 0 {
		return 1
	}
	return float64(a) / float64(b)
}

// ratioOrZero returns a/b, treating an empty denominator as 0 (error rates).
func ratioOrZero(a, b int) float64 {
	if b == 0 {
		return 0
	}
	return float64(a) / float64(b)
}

// Markdown renders the report as a table for CI summaries.
func (rep *Report) Markdown() string {
	var sb strings.Builder
	status := "PASSED"
	if !rep.Passed {
		status = "FAILED"
	}
	fmt.Fprintf(&sb, "## LLM gateway evals: %s (%s)\n\n| Metric | Value | Threshold | Result |\n|---|---|---|---|\n", status, rep.Duration)
	for _, g := range rep.Gate {
		res := "pass"
		if !g.Pass {
			res = "FAIL"
		}
		fmt.Fprintf(&sb, "| %s | %.3f | %s | %s |\n", g.Metric, g.Value, g.Bound, res)
	}
	suites := make([]string, 0, len(rep.Cases))
	for k := range rep.Cases {
		suites = append(suites, k)
	}
	sort.Strings(suites)
	sb.WriteString("\nCases per suite: ")
	for i, s := range suites {
		if i > 0 {
			sb.WriteString(", ")
		}
		fmt.Fprintf(&sb, "%s=%d", s, rep.Cases[s])
	}
	sb.WriteString("\n")
	if len(rep.Failures) > 0 {
		sb.WriteString("\n### Failing cases\n\n")
		for _, f := range rep.Failures {
			fmt.Fprintf(&sb, "- **%s** `%s`: %s\n", f.Suite, f.Case, f.Detail)
		}
	}
	return sb.String()
}
