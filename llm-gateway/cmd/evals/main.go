// Command evals runs the gateway regression evals against an in-process
// gateway (default, fully offline) or a running gateway (-base-url).
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"time"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/audit"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/bootstrap"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/config"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/evals"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "evals:", err)
		os.Exit(1)
	}
}

func run() error {
	cfgPath := flag.String("config", "evals/config.yaml", "gateway config for the in-process gateway")
	dataPath := flag.String("dataset", "evals/golden.yaml", "golden dataset")
	baseURL := flag.String("base-url", "", "evaluate a running gateway instead (tenant keys must be eval-<tenant>)")
	suites := flag.String("suites", "", "comma-separated suites (routing,fallback,pii,injection,cache,governance); empty = all")
	out := flag.String("out", "", "write the JSON report to this file")
	summary := flag.String("summary", os.Getenv("GITHUB_STEP_SUMMARY"), "append the markdown summary to this file")
	flag.Parse()

	ds, err := evals.LoadDataset(*dataPath)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	url := *baseURL
	if url == "" {
		cfg, err := config.Load(*cfgPath)
		if err != nil {
			return err
		}
		evals.InjectKeys(cfg)
		a, err := bootstrap.Build(ctx, cfg, bootstrap.Options{
			Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), AuditSink: audit.Nop{}, Version: "evals",
		})
		if err != nil {
			return err
		}
		defer func() { _ = a.Close() }()
		srv := httptest.NewServer(a.Handler)
		defer srv.Close()
		url = srv.URL
	}

	r := &evals.Runner{BaseURL: url, Client: &http.Client{Timeout: 30 * time.Second}}
	if *suites != "" {
		r.Suites = strings.Split(*suites, ",")
	}
	rep, err := r.Run(ctx, ds)
	if err != nil {
		return err
	}
	md := rep.Markdown()
	fmt.Print(md)
	if *out != "" {
		b, _ := json.MarshalIndent(rep, "", "  ")
		if err := os.WriteFile(*out, b, 0o600); err != nil {
			return err
		}
	}
	if *summary != "" {
		f, err := os.OpenFile(*summary, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600) //nolint:gosec // CI-provided path
		if err == nil {
			_, _ = f.WriteString(md)
			_ = f.Close()
		}
	}
	if !rep.Passed {
		return fmt.Errorf("eval thresholds not met")
	}
	return nil
}
