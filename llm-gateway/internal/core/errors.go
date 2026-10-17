package core

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"
)

// Error codes returned in the OpenAI-style error envelope.
const (
	CodeInvalidRequest    = "invalid_request_error"
	CodeAuthentication    = "invalid_api_key"
	CodePermission        = "model_not_allowed"
	CodeRateLimited       = "rate_limit_exceeded"
	CodeBudgetExceeded    = "insufficient_quota"
	CodePIIBlocked        = "pii_detected"
	CodeInjectionBlocked  = "prompt_injection_detected"
	CodeModelNotFound     = "model_not_found"
	CodeUpstreamError     = "upstream_error"
	CodeUpstreamTimeout   = "upstream_timeout"
	CodeAllTargetsFailed  = "all_targets_failed"
	CodeInternal          = "internal_error"
	CodeClientClosed      = "client_closed_request"
	CodeCircuitOpen       = "circuit_open"
	CodeIdempotencyInUse  = "idempotency_key_in_use"
	CodeUnsupportedStream = "unsupported_stream"
)

// Error is a typed gateway error that maps cleanly onto an HTTP response.
type Error struct {
	Status     int
	Type       string
	Code       string
	Message    string
	Retryable  bool
	RetryAfter time.Duration
	Cause      error
}

func (e *Error) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.Cause)
	}
	return e.Code + ": " + e.Message
}

func (e *Error) Unwrap() error { return e.Cause }

// Errorf builds a gateway error.
func Errorf(status int, code, format string, args ...any) *Error {
	typ := "invalid_request_error"
	switch {
	case status == http.StatusUnauthorized:
		typ = "authentication_error"
	case status == http.StatusForbidden:
		typ = "permission_error"
	case status == http.StatusTooManyRequests:
		typ = "rate_limit_error"
	case status >= 500:
		typ = "api_error"
	}
	return &Error{Status: status, Type: typ, Code: code, Message: fmt.Sprintf(format, args...)}
}

// UpstreamError builds an error describing a failed provider call.
func UpstreamError(status int, msg string, retryAfter time.Duration) *Error {
	retryable := status == http.StatusTooManyRequests || status == http.StatusRequestTimeout || status >= 500
	e := Errorf(http.StatusBadGateway, CodeUpstreamError, "upstream returned %d: %s", status, msg)
	e.Retryable = retryable
	e.RetryAfter = retryAfter
	if status == http.StatusTooManyRequests {
		e.Status = http.StatusTooManyRequests
		e.Type = "rate_limit_error"
	}
	if status >= 400 && status < 500 && !retryable {
		// Client errors from the upstream (bad params) are surfaced as 400.
		e.Status = http.StatusBadRequest
		e.Type = "invalid_request_error"
	}
	return e
}

// IsRetryable reports whether err is worth retrying or failing over.
func IsRetryable(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var ge *Error
	if errors.As(err, &ge) {
		return ge.Retryable
	}
	// Transport-level errors (connection refused, reset) are retryable.
	return true
}

// AsError converts any error into a gateway error.
func AsError(err error) *Error {
	var ge *Error
	if errors.As(err, &ge) {
		return ge
	}
	switch {
	case errors.Is(err, context.Canceled):
		return &Error{Status: 499, Type: "api_error", Code: CodeClientClosed, Message: "client closed request", Cause: err}
	case errors.Is(err, context.DeadlineExceeded):
		return &Error{Status: http.StatusGatewayTimeout, Type: "api_error", Code: CodeUpstreamTimeout, Message: "upstream timeout", Cause: err}
	default:
		return &Error{Status: http.StatusInternalServerError, Type: "api_error", Code: CodeInternal, Message: "internal error", Cause: err}
	}
}
