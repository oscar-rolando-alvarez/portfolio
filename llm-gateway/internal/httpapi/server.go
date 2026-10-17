// Package httpapi is the inbound HTTP adapter: an OpenAI-compatible API
// (/v1/chat/completions with SSE, /v1/embeddings, /v1/models), admin
// endpoints for FinOps reporting, health probes and Prometheus metrics.
package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/app"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/governance"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/telemetry"
)

// Options configures the HTTP adapter.
type Options struct {
	Gateway        *app.Gateway
	Metrics        *telemetry.Metrics
	Logger         *slog.Logger
	MaxBodyBytes   int64
	RequestTimeout time.Duration
	// AdminKeySHA256 returns the current admin key hash ("" disables admin).
	AdminKeySHA256 func() string
	// Ready checks dependencies for /readyz.
	Ready []core.Pinger
	// Reload triggers a configuration reload (nil disables the endpoint).
	Reload func(ctx context.Context) error
	// Version is reported by /healthz.
	Version string
}

type server struct {
	Options
}

// NewHandler builds the root HTTP handler.
func NewHandler(o Options) http.Handler {
	if o.MaxBodyBytes <= 0 {
		o.MaxBodyBytes = 4 << 20
	}
	s := &server{Options: o}
	r := chi.NewRouter()
	r.Use(s.recoverer, requestID, s.accessLog, securityHeaders)

	r.Get("/healthz", s.healthz)
	r.Get("/readyz", s.readyz)
	r.Handle("/metrics", promhttp.HandlerFor(o.Metrics.Registry, promhttp.HandlerOpts{}))

	r.Route("/v1", func(r chi.Router) {
		r.Use(s.timeout, s.authenticate)
		r.Post("/chat/completions", s.chatCompletions)
		r.Post("/embeddings", s.embeddings)
		r.Get("/models", s.models)
		r.Get("/models/{id}", s.model)
	})
	r.Route("/admin/v1", func(r chi.Router) {
		r.Use(s.adminAuth)
		r.Get("/usage", s.usage)
		r.Get("/tenants", s.tenants)
		r.Get("/routes", s.routes)
		r.Post("/reload", s.reload)
	})
	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, core.Errorf(http.StatusNotFound, "not_found", "unknown route"))
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, core.Errorf(http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed"))
	})
	return otelhttp.NewHandler(r, "llm-gateway",
		otelhttp.WithSpanNameFormatter(func(_ string, r *http.Request) string { return r.Method + " " + r.URL.Path }),
		otelhttp.WithFilter(func(r *http.Request) bool {
			return r.URL.Path != "/metrics" && r.URL.Path != "/healthz" && r.URL.Path != "/readyz"
		}))
}

// ---------------------------------------------------------------- middleware

type ctxKey int

const (
	keyRequestID ctxKey = iota
	keyPrincipal
)

var requestIDRe = regexp.MustCompile(`^[A-Za-z0-9._\-]{1,128}$`)

func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if !requestIDRe.MatchString(id) {
			var b [12]byte
			_, _ = rand.Read(b[:])
			id = "req_" + hex.EncodeToString(b[:])
		}
		w.Header().Set("X-Request-ID", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), keyRequestID, id)))
	})
}

func reqID(ctx context.Context) string {
	id, _ := ctx.Value(keyRequestID).(string)
	return id
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (s *statusRecorder) WriteHeader(code int) {
	if s.status == 0 {
		s.status = code
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

// Unwrap lets http.ResponseController reach Flush/SetWriteDeadline.
func (s *statusRecorder) Unwrap() http.ResponseWriter { return s.ResponseWriter }

func (s *server) accessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		if r.URL.Path == "/metrics" || r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
			return
		}
		s.Logger.LogAttrs(r.Context(), slog.LevelInfo, "http request",
			slog.String("request_id", reqID(r.Context())), slog.String("method", r.Method),
			slog.String("path", r.URL.Path), slog.Int("status", rec.status), slog.Int("bytes", rec.bytes),
			slog.Duration("duration", time.Since(start)))
	})
}

func (s *server) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() { //nolint:contextcheck // runs on the request goroutine and logs with r.Context()
			if v := recover(); v != nil {
				if v == http.ErrAbortHandler { //nolint:errorlint // sentinel compared by identity per net/http docs
					panic(v)
				}
				s.Logger.ErrorContext(r.Context(), "panic", "panic", v, "path", r.URL.Path)
				writeError(w, core.Errorf(http.StatusInternalServerError, core.CodeInternal, "internal error"))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func (s *server) timeout(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.RequestTimeout <= 0 {
			next.ServeHTTP(w, r)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), s.RequestTimeout)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// bearer extracts an API key from Authorization, api-key or x-api-key.
func bearer(r *http.Request) string {
	if h := r.Header.Get("Authorization"); h != "" {
		if after, ok := strings.CutPrefix(h, "Bearer "); ok {
			return strings.TrimSpace(after)
		}
		if after, ok := strings.CutPrefix(h, "bearer "); ok {
			return strings.TrimSpace(after)
		}
		return ""
	}
	if h := r.Header.Get("api-key"); h != "" {
		return h
	}
	return r.Header.Get("x-api-key")
}

func (s *server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, err := s.Gateway.Authenticate(bearer(r))
		if err != nil {
			writeError(w, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), keyPrincipal, p)))
	})
}

func principal(ctx context.Context) governance.Principal {
	p, _ := ctx.Value(keyPrincipal).(governance.Principal)
	return p
}

func (s *server) adminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		want := ""
		if s.AdminKeySHA256 != nil {
			want = s.AdminKeySHA256()
		}
		if want == "" {
			writeError(w, core.Errorf(http.StatusNotFound, "not_found", "admin API disabled"))
			return
		}
		got := governance.HashKey(bearer(r))
		if subtle.ConstantTimeCompare([]byte(got), []byte(want)) != 1 {
			writeError(w, core.Errorf(http.StatusUnauthorized, core.CodeAuthentication, "invalid admin key"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ---------------------------------------------------------------- helpers

type errorBody struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Message string  `json:"message"`
	Type    string  `json:"type"`
	Code    string  `json:"code"`
	Param   *string `json:"param"`
}

func writeError(w http.ResponseWriter, err error) {
	ge := core.AsError(err)
	status := ge.Status
	if status == 499 {
		return // client is gone; nothing to write
	}
	if ge.RetryAfter > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(int(ge.RetryAfter.Round(time.Second).Seconds())+1))
	}
	msg := ge.Message
	if status >= 500 && ge.Code == core.CodeInternal {
		msg = "internal error" // never leak internals
	}
	writeJSON(w, status, errorBody{Error: errorDetail{Message: msg, Type: ge.Type, Code: ge.Code}})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, limit int64, v any) error {
	if ct := r.Header.Get("Content-Type"); strings.HasPrefix(ct, "multipart/") {
		return core.Errorf(http.StatusUnsupportedMediaType, core.CodeInvalidRequest, "Content-Type must be application/json")
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	if err := dec.Decode(v); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			return core.Errorf(http.StatusRequestEntityTooLarge, core.CodeInvalidRequest, "request body exceeds %d bytes", limit)
		}
		return core.Errorf(http.StatusBadRequest, core.CodeInvalidRequest, "invalid JSON body: %s", err.Error())
	}
	return nil
}

func setInfoHeaders(h http.Header, info app.Info) {
	if info.Provider != "" {
		h.Set("X-Gateway-Provider", info.Provider)
	}
	if info.ProviderModel != "" {
		h.Set("X-Gateway-Upstream-Model", info.ProviderModel)
	}
	if info.Cache != "" {
		h.Set("X-Gateway-Cache", info.Cache)
	}
	h.Set("X-Gateway-Fallbacks", strconv.Itoa(info.Fallbacks))
	if info.BudgetWarning {
		h.Set("X-Gateway-Budget-Warning", "true")
	}
	if info.PIIRedacted > 0 {
		h.Set("X-Gateway-PII-Redacted", strconv.Itoa(info.PIIRedacted))
	}
	if info.Replayed {
		h.Set("Idempotent-Replayed", "true")
	}
}

func meta(r *http.Request, endpoint string) app.Meta {
	cc := strings.ToLower(r.Header.Get("Cache-Control"))
	return app.Meta{
		RequestID:      reqID(r.Context()),
		Endpoint:       endpoint,
		CacheBypass:    strings.Contains(cc, "no-cache") || strings.Contains(cc, "no-store") || r.Header.Get("X-Gateway-Cache") == "bypass",
		IdempotencyKey: strings.TrimSpace(r.Header.Get("Idempotency-Key")),
	}
}
