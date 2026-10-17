// Package tokens provides a fast, dependency-free token estimator used for
// pre-flight rate limiting and budget checks. Provider-reported usage always
// takes precedence for accounting once a response is received.
package tokens

import (
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
)

// perMessageOverhead approximates role/formatting tokens added per message.
const perMessageOverhead = 4

// EstimateText approximates the token count of s using the common
// ~4 bytes/token heuristic (multi-byte scripts naturally count higher).
func EstimateText(s string) int {
	if s == "" {
		return 0
	}
	return (len(s) + 3) / 4
}

// EstimatePrompt approximates the prompt tokens of a chat request.
func EstimatePrompt(req *core.ChatRequest) int {
	n := 3 // priming tokens
	for _, m := range req.Messages {
		n += perMessageOverhead + EstimateText(m.Content.String()) + EstimateText(m.Name)
	}
	return n
}
