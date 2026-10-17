// Package routing selects provider targets for a model alias (priority,
// weighted, cost-aware, latency-aware) and executes calls with retries,
// jittered backoff, per-target circuit breakers, fallback and optional
// request hedging.
package routing

import (
	"sync"
	"time"
)

// Breaker states.
const (
	StateClosed   = "closed"
	StateOpen     = "open"
	StateHalfOpen = "half_open"
)

// Breaker is a consecutive-failure circuit breaker with a single half-open
// probe. It is safe for concurrent use.
type Breaker struct {
	mu        sync.Mutex
	state     string
	failures  int
	openedAt  time.Time
	probing   bool
	threshold int
	openFor   time.Duration
	now       func() time.Time
	onChange  func(state string)
}

// NewBreaker creates a closed breaker.
func NewBreaker(threshold int, openFor time.Duration, now func() time.Time, onChange func(string)) *Breaker {
	if now == nil {
		now = time.Now
	}
	if threshold <= 0 {
		threshold = 5
	}
	return &Breaker{state: StateClosed, threshold: threshold, openFor: openFor, now: now, onChange: onChange}
}

// Configure updates thresholds (used on config hot reload).
func (b *Breaker) Configure(threshold int, openFor time.Duration) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if threshold > 0 {
		b.threshold = threshold
	}
	if openFor > 0 {
		b.openFor = openFor
	}
}

func (b *Breaker) setState(s string) {
	if b.state == s {
		return
	}
	b.state = s
	if b.onChange != nil {
		b.onChange(s)
	}
}

// Allow reports whether a call may proceed. In half-open state only one
// probe is admitted at a time.
func (b *Breaker) Allow() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	switch b.state {
	case StateOpen:
		if b.now().Sub(b.openedAt) < b.openFor {
			return false
		}
		b.setState(StateHalfOpen)
		b.probing = true
		return true
	case StateHalfOpen:
		if b.probing {
			return false
		}
		b.probing = true
		return true
	default:
		return true
	}
}

// Ready reports whether Allow would currently admit a call, without
// reserving a half-open probe. Used for planning.
func (b *Breaker) Ready() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	switch b.state {
	case StateOpen:
		return b.now().Sub(b.openedAt) >= b.openFor
	case StateHalfOpen:
		return !b.probing
	default:
		return true
	}
}

// Success records a successful call.
func (b *Breaker) Success() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.failures = 0
	b.probing = false
	b.setState(StateClosed)
}

// Failure records a failed call.
func (b *Breaker) Failure() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.probing = false
	if b.state == StateHalfOpen {
		b.openedAt = b.now()
		b.setState(StateOpen)
		return
	}
	b.failures++
	if b.failures >= b.threshold {
		b.openedAt = b.now()
		b.setState(StateOpen)
	}
}

// Release frees a half-open probe slot without recording an outcome (for
// example when the client cancelled the request).
func (b *Breaker) Release() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.probing = false
}

// State returns the current state name.
func (b *Breaker) State() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.state == StateOpen && b.now().Sub(b.openedAt) >= b.openFor {
		return StateHalfOpen
	}
	return b.state
}
