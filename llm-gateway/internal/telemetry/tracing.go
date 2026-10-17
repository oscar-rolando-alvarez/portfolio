package telemetry

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
	"go.opentelemetry.io/otel/trace/noop"
)

// GenAI semantic convention attribute keys (OpenTelemetry semconv, gen_ai.*).
const (
	AttrGenAIOperation     = attribute.Key("gen_ai.operation.name")
	AttrGenAIProvider      = attribute.Key("gen_ai.provider.name")
	AttrGenAIRequestModel  = attribute.Key("gen_ai.request.model")
	AttrGenAIResponseModel = attribute.Key("gen_ai.response.model")
	AttrGenAIResponseID    = attribute.Key("gen_ai.response.id")
	AttrGenAIMaxTokens     = attribute.Key("gen_ai.request.max_tokens")
	AttrGenAITemperature   = attribute.Key("gen_ai.request.temperature")
	AttrGenAITopP          = attribute.Key("gen_ai.request.top_p")
	AttrGenAIFinishReasons = attribute.Key("gen_ai.response.finish_reasons")
	AttrGenAIInputTokens   = attribute.Key("gen_ai.usage.input_tokens")
	AttrGenAIOutputTokens  = attribute.Key("gen_ai.usage.output_tokens")
	AttrErrorType          = attribute.Key("error.type")

	// Gateway-specific attributes.
	AttrTenant    = attribute.Key("llmgw.tenant")
	AttrAlias     = attribute.Key("llmgw.model_alias")
	AttrCache     = attribute.Key("llmgw.cache.result")
	AttrFallbacks = attribute.Key("llmgw.fallbacks")
	AttrCostUSD   = attribute.Key("llmgw.cost_usd")
	AttrPII       = attribute.Key("llmgw.guardrails.pii_findings")
	AttrInjection = attribute.Key("llmgw.guardrails.injection_score")
)

// TracerName is the instrumentation scope name.
const TracerName = "github.com/oscar-rolando-alvarez/portfolio/llm-gateway"

// Tracer returns the gateway tracer from the global provider.
func Tracer() trace.Tracer { return otel.Tracer(TracerName) }

// InitTracing installs a global tracer provider exporting OTLP/HTTP to
// endpoint. With an empty endpoint a no-op provider is installed so spans
// cost almost nothing.
func InitTracing(ctx context.Context, serviceName, version, endpoint string, ratio float64) (func(context.Context) error, error) {
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
	if endpoint == "" {
		otel.SetTracerProvider(noop.NewTracerProvider())
		return func(context.Context) error { return nil }, nil
	}
	opts := []otlptracehttp.Option{}
	if strings.HasPrefix(endpoint, "http://") || strings.HasPrefix(endpoint, "https://") {
		opts = append(opts, otlptracehttp.WithEndpointURL(strings.TrimRight(endpoint, "/")+"/v1/traces"))
	} else {
		opts = append(opts, otlptracehttp.WithEndpoint(endpoint), otlptracehttp.WithInsecure())
	}
	exp, err := otlptracehttp.New(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("otlp exporter: %w", err)
	}
	res := resource.NewSchemaless(
		attribute.String("service.name", serviceName),
		attribute.String("service.version", version),
	)
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(ratio))),
	)
	otel.SetTracerProvider(tp)
	return tp.Shutdown, nil
}

// NewLogger builds the application logger.
func NewLogger(w io.Writer, level, format string) *slog.Logger {
	var lvl slog.Level
	if err := lvl.UnmarshalText([]byte(level)); err != nil {
		lvl = slog.LevelInfo
	}
	opts := &slog.HandlerOptions{Level: lvl}
	if format == "text" {
		return slog.New(slog.NewTextHandler(w, opts))
	}
	return slog.New(slog.NewJSONHandler(w, opts))
}
