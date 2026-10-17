// Package core holds the gateway domain model (OpenAI-compatible wire types,
// usage, tenants) and the ports that adapters implement. It has no
// dependencies on infrastructure packages.
package core

import (
	"bytes"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
)

// ChatRequest is an OpenAI-compatible chat completion request. Fields the
// gateway does not interpret (tools, response_format, seed, ...) are kept in
// Extra and forwarded verbatim so existing SDK features keep working.
type ChatRequest struct {
	Model         string          `json:"model"`
	Messages      []Message       `json:"messages"`
	Stream        bool            `json:"stream,omitempty"`
	StreamOptions *StreamOptions  `json:"stream_options,omitempty"`
	Temperature   *float64        `json:"temperature,omitempty"`
	TopP          *float64        `json:"top_p,omitempty"`
	MaxTokens     *int            `json:"max_tokens,omitempty"`
	MaxCompTokens *int            `json:"max_completion_tokens,omitempty"`
	N             *int            `json:"n,omitempty"`
	Stop          json.RawMessage `json:"stop,omitempty"`
	User          string          `json:"user,omitempty"`

	Extra map[string]json.RawMessage `json:"-"`
}

// StreamOptions mirrors the OpenAI stream_options object.
type StreamOptions struct {
	IncludeUsage bool `json:"include_usage"`
}

var chatKnown = map[string]struct{}{
	"model": {}, "messages": {}, "stream": {}, "stream_options": {}, "temperature": {},
	"top_p": {}, "max_tokens": {}, "max_completion_tokens": {}, "n": {}, "stop": {}, "user": {},
}

type chatAlias ChatRequest

// UnmarshalJSON decodes known fields and keeps unknown ones in Extra.
func (r *ChatRequest) UnmarshalJSON(b []byte) error {
	var a chatAlias
	if err := json.Unmarshal(b, &a); err != nil {
		return err
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(b, &raw); err != nil {
		return err
	}
	for k := range chatKnown {
		delete(raw, k)
	}
	if len(raw) > 0 {
		a.Extra = raw
	}
	*r = ChatRequest(a)
	return nil
}

// MarshalJSON encodes known fields plus Extra.
func (r ChatRequest) MarshalJSON() ([]byte, error) {
	b, err := json.Marshal(chatAlias(r))
	if err != nil || len(r.Extra) == 0 {
		return b, err
	}
	return mergeExtra(b, r.Extra)
}

// HasTools reports whether the request uses tool/function calling.
func (r *ChatRequest) HasTools() bool {
	_, t := r.Extra["tools"]
	_, f := r.Extra["functions"]
	return t || f
}

// MaxOutputTokens returns the effective output token cap, or def when unset.
func (r *ChatRequest) MaxOutputTokens(def int) int {
	switch {
	case r.MaxCompTokens != nil && *r.MaxCompTokens > 0:
		return *r.MaxCompTokens
	case r.MaxTokens != nil && *r.MaxTokens > 0:
		return *r.MaxTokens
	default:
		return def
	}
}

// Clone returns a deep-enough copy so guardrails can mutate messages without
// affecting the caller's request.
func (r *ChatRequest) Clone() *ChatRequest {
	c := *r
	c.Messages = make([]Message, len(r.Messages))
	for i, m := range r.Messages {
		c.Messages[i] = m.clone()
	}
	return &c
}

// Validate performs basic structural validation.
func (r *ChatRequest) Validate() error {
	if strings.TrimSpace(r.Model) == "" {
		return errors.New("model is required")
	}
	if len(r.Messages) == 0 {
		return errors.New("messages must not be empty")
	}
	if len(r.Messages) > 1024 {
		return errors.New("too many messages")
	}
	for i, m := range r.Messages {
		switch m.Role {
		case "system", "developer", "user", "assistant", "tool", "function":
		default:
			return errors.New("messages[" + strconv.Itoa(i) + "].role is invalid")
		}
	}
	if r.N != nil && (*r.N < 1 || *r.N > 8) {
		return errors.New("n must be between 1 and 8")
	}
	if r.Temperature != nil && (*r.Temperature < 0 || *r.Temperature > 2) {
		return errors.New("temperature must be between 0 and 2")
	}
	return nil
}

// Message is a chat message. Content may be a string or an array of parts.
type Message struct {
	Role       string          `json:"role"`
	Content    Content         `json:"content"`
	Name       string          `json:"name,omitempty"`
	ToolCalls  json.RawMessage `json:"tool_calls,omitempty"`
	ToolCallID string          `json:"tool_call_id,omitempty"`
}

func (m Message) clone() Message {
	c := m
	if m.Content.Parts != nil {
		c.Content.Parts = make([]ContentPart, len(m.Content.Parts))
		copy(c.Content.Parts, m.Content.Parts)
	}
	return c
}

// Content is either a plain string or a list of typed parts (multimodal).
type Content struct {
	Text  string
	Parts []ContentPart
	Null  bool
}

// ContentPart is one element of an array content. Non-text parts are kept raw.
type ContentPart struct {
	Type string
	Text string
	Raw  json.RawMessage
}

// TextContent builds a string content.
func TextContent(s string) Content { return Content{Text: s} }

// String returns the concatenated text of the content.
func (c Content) String() string {
	if c.Parts == nil {
		return c.Text
	}
	var sb strings.Builder
	for i, p := range c.Parts {
		if p.Type == "text" {
			if i > 0 && sb.Len() > 0 {
				sb.WriteByte('\n')
			}
			sb.WriteString(p.Text)
		}
	}
	return sb.String()
}

// MapText applies f to every text segment in place.
func (c *Content) MapText(f func(string) string) {
	if c.Parts == nil {
		c.Text = f(c.Text)
		return
	}
	for i := range c.Parts {
		if c.Parts[i].Type == "text" {
			c.Parts[i].Text = f(c.Parts[i].Text)
			c.Parts[i].Raw = nil
		}
	}
}

// UnmarshalJSON accepts a string, null or an array of parts.
func (c *Content) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	switch {
	case len(b) == 0 || bytes.Equal(b, []byte("null")):
		*c = Content{Null: true}
		return nil
	case b[0] == '"':
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		*c = Content{Text: s}
		return nil
	case b[0] == '[':
		var raws []json.RawMessage
		if err := json.Unmarshal(b, &raws); err != nil {
			return err
		}
		parts := make([]ContentPart, 0, len(raws))
		for _, r := range raws {
			var head struct {
				Type string `json:"type"`
				Text string `json:"text"`
			}
			if err := json.Unmarshal(r, &head); err != nil {
				return err
			}
			p := ContentPart{Type: head.Type, Raw: r}
			if head.Type == "text" {
				p.Text = head.Text
			}
			parts = append(parts, p)
		}
		*c = Content{Parts: parts}
		return nil
	default:
		return errors.New("content must be a string, null or an array")
	}
}

// MarshalJSON emits the same shape that was received.
func (c Content) MarshalJSON() ([]byte, error) {
	if c.Null {
		return []byte("null"), nil
	}
	if c.Parts == nil {
		return json.Marshal(c.Text)
	}
	out := make([]json.RawMessage, 0, len(c.Parts))
	for _, p := range c.Parts {
		if p.Raw != nil && p.Type != "text" {
			out = append(out, p.Raw)
			continue
		}
		if p.Raw != nil {
			// Text part: re-encode with the (possibly redacted) text, keep other keys.
			var m map[string]json.RawMessage
			if err := json.Unmarshal(p.Raw, &m); err == nil {
				t, _ := json.Marshal(p.Text)
				m["text"] = t
				b, err := json.Marshal(m)
				if err != nil {
					return nil, err
				}
				out = append(out, b)
				continue
			}
		}
		b, err := json.Marshal(map[string]string{"type": p.Type, "text": p.Text})
		if err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return json.Marshal(out)
}

// ChatResponse is an OpenAI-compatible non-streaming response.
type ChatResponse struct {
	ID                string   `json:"id"`
	Object            string   `json:"object"`
	Created           int64    `json:"created"`
	Model             string   `json:"model"`
	Choices           []Choice `json:"choices"`
	Usage             *Usage   `json:"usage,omitempty"`
	SystemFingerprint string   `json:"system_fingerprint,omitempty"`
}

// Choice is one completion alternative.
type Choice struct {
	Index        int     `json:"index"`
	Message      Message `json:"message"`
	FinishReason string  `json:"finish_reason"`
}

// Usage reports token consumption.
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// Add accumulates another usage.
func (u *Usage) Add(o Usage) {
	u.PromptTokens += o.PromptTokens
	u.CompletionTokens += o.CompletionTokens
	u.TotalTokens += o.TotalTokens
}

// ChatChunk is one SSE event of a streaming chat completion.
type ChatChunk struct {
	ID      string        `json:"id"`
	Object  string        `json:"object"`
	Created int64         `json:"created"`
	Model   string        `json:"model"`
	Choices []ChunkChoice `json:"choices"`
	Usage   *Usage        `json:"usage,omitempty"`
}

// ChunkChoice is the delta for one choice in a chunk.
type ChunkChoice struct {
	Index        int     `json:"index"`
	Delta        Delta   `json:"delta"`
	FinishReason *string `json:"finish_reason"`
}

// Delta is the incremental message content.
type Delta struct {
	Role      string          `json:"role,omitempty"`
	Content   string          `json:"content,omitempty"`
	ToolCalls json.RawMessage `json:"tool_calls,omitempty"`
}

// EmbeddingRequest is an OpenAI-compatible embeddings request.
type EmbeddingRequest struct {
	Model          string          `json:"model"`
	Input          json.RawMessage `json:"input"`
	EncodingFormat string          `json:"encoding_format,omitempty"`
	Dimensions     *int            `json:"dimensions,omitempty"`
	User           string          `json:"user,omitempty"`
}

// Inputs decodes Input into a list of strings (string or []string forms).
func (r *EmbeddingRequest) Inputs() ([]string, error) {
	b := bytes.TrimSpace(r.Input)
	if len(b) == 0 {
		return nil, errors.New("input is required")
	}
	if b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return nil, err
		}
		return []string{s}, nil
	}
	var ss []string
	if err := json.Unmarshal(b, &ss); err != nil {
		return nil, errors.New("input must be a string or an array of strings")
	}
	if len(ss) == 0 {
		return nil, errors.New("input must not be empty")
	}
	return ss, nil
}

// EmbeddingResponse is an OpenAI-compatible embeddings response.
type EmbeddingResponse struct {
	Object string          `json:"object"`
	Data   []EmbeddingData `json:"data"`
	Model  string          `json:"model"`
	Usage  Usage           `json:"usage"`
}

// EmbeddingData is a single embedding vector.
type EmbeddingData struct {
	Object    string    `json:"object"`
	Index     int       `json:"index"`
	Embedding []float32 `json:"embedding"`
}

// ModelInfo is an entry of /v1/models.
type ModelInfo struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	OwnedBy string `json:"owned_by"`
}

func mergeExtra(b []byte, extra map[string]json.RawMessage) ([]byte, error) {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	for k, v := range extra {
		if _, exists := m[k]; !exists {
			m[k] = v
		}
	}
	return json.Marshal(m)
}
