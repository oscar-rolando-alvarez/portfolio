package evals_test

import (
	"context"
	"io"
	"log/slog"
	"net/http/httptest"
	"testing"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/audit"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/bootstrap"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/config"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/evals"
)

// TestGoldenDataset runs the full offline eval suite as part of go test.
func TestGoldenDataset(t *testing.T) {
	cfg, err := config.Load("../../evals/config.yaml")
	if err != nil {
		t.Fatal(err)
	}
	evals.InjectKeys(cfg)
	a, err := bootstrap.Build(context.Background(), cfg, bootstrap.Options{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), AuditSink: audit.Nop{},
	})
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(a.Handler)
	defer srv.Close()
	ds, err := evals.LoadDataset("../../evals/golden.yaml")
	if err != nil {
		t.Fatal(err)
	}
	rep, err := (&evals.Runner{BaseURL: srv.URL, Client: srv.Client()}).Run(context.Background(), ds)
	if err != nil {
		t.Fatal(err)
	}
	if !rep.Passed {
		t.Fatal(rep.Markdown())
	}
	if len(rep.Gate) < 10 {
		t.Fatalf("expected all suites to be gated, got %d metrics", len(rep.Gate))
	}
}
