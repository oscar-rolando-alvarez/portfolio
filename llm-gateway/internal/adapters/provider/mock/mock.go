// Package mock implements a deterministic, offline core.Provider used by
// tests, evals, load tests and the zero-config demo.
//
// Behaviour is fully determined by the request so results are reproducible:
//   - the completion echoes the last user message as received (which lets
//     evals assert what an upstream actually saw after redaction);
//   - directives embedded in the last user message drive failure injection:
//     [[mock:error=503]], [[mock:sleep=250ms]], [[mock:say=literal text]]
//     ({at} in a say directive is rendered as @).
package mock

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"hash/fnv"
	"io"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/core"
	"github.com/oscar-rolando-alvarez/portfolio/llm-gateway/internal/tokens"
)

// Options tunes the provider.
type Options struct {
	Latency       time.Duration
	ChunkDelay    time.Duration
	FailStatus    int
	EmbeddingDims int
	Now           func() time.Time
}

// Provider is the deterministic mock.
type Provider struct {
	name string
	opts Options
}

// New creates a mock provider.
func New(name string, opts Options) *Provider {
	if opts.EmbeddingDims <= 0 {
		opts.EmbeddingDims = 256
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	return &Provider{name: name, opts: opts}
}

// Name implements core.Provider.
func (p *Provider) Name() string { return p.name }

var directiveRe = regexp.MustCompile(`\[\[mock:(error|sleep|say)=([^\]]*)\]\]`)

type directives struct {
	errStatus int
	sleep     time.Duration
	say       string
	hasSay    bool
}

func parseDirectives(s string) (directives, string) {
	var d directives
	for _, m := range directiveRe.FindAllStringSubmatch(s, -1) {
		switch m[1] {
		case "error":
			d.errStatus, _ = strconv.Atoi(m[2])
		case "sleep":
			d.sleep, _ = time.ParseDuration(m[2])
		case "say":
			// {at} lets tests make the model emit an e-mail address without
			// the prompt itself containing one (input redaction would hide it).
			d.say, d.hasSay = strings.ReplaceAll(m[2], "{at}", "@"), true
		}
	}
	return d, strings.TrimSpace(directiveRe.ReplaceAllString(s, ""))
}

func lastUser(req *core.ChatRequest) string {
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if req.Messages[i].Role == "user" {
			return req.Messages[i].Content.String()
		}
	}
	return ""
}

func (p *Provider) prepare(ctx context.Context, req *core.ChatRequest) (string, error) {
	d, clean := parseDirectives(lastUser(req))
	wait := p.opts.Latency + d.sleep
	if wait > 0 {
		t := time.NewTimer(wait)
		defer t.Stop()
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-t.C:
		}
	}
	status := p.opts.FailStatus
	if d.errStatus != 0 {
		status = d.errStatus
	}
	if status != 0 {
		return "", core.UpstreamError(status, http.StatusText(status)+" (mock "+p.name+")", 0)
	}
	if d.hasSay {
		return d.say, nil
	}
	if len(clean) > 300 {
		clean = clean[:300]
	}
	return fmt.Sprintf("Mock response from %s/%s. You said: %s", p.name, req.Model, clean), nil
}

func (p *Provider) id(req *core.ChatRequest, content string) string {
	h := sha256.Sum256([]byte(p.name + req.Model + content))
	return "chatcmpl-mock-" + hex.EncodeToString(h[:8])
}

// Chat implements core.Provider.
func (p *Provider) Chat(ctx context.Context, req *core.ChatRequest) (*core.ChatResponse, error) {
	content, err := p.prepare(ctx, req)
	if err != nil {
		return nil, err
	}
	pt := tokens.EstimatePrompt(req)
	ct := tokens.EstimateText(content)
	if limit := req.MaxOutputTokens(0); limit > 0 && ct > limit {
		ct = limit
	}
	return &core.ChatResponse{
		ID:      p.id(req, content),
		Object:  "chat.completion",
		Created: p.opts.Now().Unix(),
		Model:   req.Model,
		Choices: []core.Choice{{
			Index:        0,
			Message:      core.Message{Role: "assistant", Content: core.TextContent(content)},
			FinishReason: "stop",
		}},
		Usage: &core.Usage{PromptTokens: pt, CompletionTokens: ct, TotalTokens: pt + ct},
	}, nil
}

// ChatStream implements core.Provider.
func (p *Provider) ChatStream(ctx context.Context, req *core.ChatRequest) (core.ChatStream, error) {
	resp, err := p.Chat(ctx, req)
	if err != nil {
		return nil, err
	}
	content := resp.Choices[0].Message.Content.String()
	words := strings.SplitAfter(content, " ")
	chunks := make([]*core.ChatChunk, 0, len(words)+2)
	mk := func(delta core.Delta, finish *string) *core.ChatChunk {
		return &core.ChatChunk{
			ID: resp.ID, Object: "chat.completion.chunk", Created: resp.Created, Model: resp.Model,
			Choices: []core.ChunkChoice{{Index: 0, Delta: delta, FinishReason: finish}},
		}
	}
	chunks = append(chunks, mk(core.Delta{Role: "assistant"}, nil))
	for _, w := range words {
		chunks = append(chunks, mk(core.Delta{Content: w}, nil))
	}
	stop := "stop"
	chunks = append(chunks, mk(core.Delta{}, &stop))
	if req.StreamOptions != nil && req.StreamOptions.IncludeUsage {
		chunks = append(chunks, &core.ChatChunk{
			ID: resp.ID, Object: "chat.completion.chunk", Created: resp.Created, Model: resp.Model,
			Choices: []core.ChunkChoice{}, Usage: resp.Usage,
		})
	}
	return &stream{ctx: ctx, chunks: chunks, delay: p.opts.ChunkDelay}, nil
}

type stream struct {
	ctx    context.Context
	chunks []*core.ChatChunk
	i      int
	delay  time.Duration
}

func (s *stream) Recv() (*core.ChatChunk, error) {
	if err := s.ctx.Err(); err != nil {
		return nil, err
	}
	if s.i >= len(s.chunks) {
		return nil, io.EOF
	}
	if s.delay > 0 && s.i > 0 {
		t := time.NewTimer(s.delay)
		select {
		case <-s.ctx.Done():
			t.Stop()
			return nil, s.ctx.Err()
		case <-t.C:
		}
	}
	c := s.chunks[s.i]
	s.i++
	return c, nil
}

func (s *stream) Close() error { return nil }

// Embed implements core.Provider with a deterministic lexical embedding
// (feature-hashed unigrams + bigrams, L2-normalised). Texts with the same
// content words map to the same vector, so near-duplicates are similar.
func (p *Provider) Embed(ctx context.Context, req *core.EmbeddingRequest) (*core.EmbeddingResponse, error) {
	if p.opts.FailStatus != 0 {
		return nil, core.UpstreamError(p.opts.FailStatus, "mock failure", 0)
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	inputs, err := req.Inputs()
	if err != nil {
		return nil, core.Errorf(http.StatusBadRequest, core.CodeInvalidRequest, "%s", err.Error())
	}
	dims := p.opts.EmbeddingDims
	if req.Dimensions != nil && *req.Dimensions > 0 && *req.Dimensions < dims {
		dims = *req.Dimensions
	}
	out := &core.EmbeddingResponse{Object: "list", Model: req.Model}
	total := 0
	for i, in := range inputs {
		out.Data = append(out.Data, core.EmbeddingData{Object: "embedding", Index: i, Embedding: Vector(in, dims)})
		total += tokens.EstimateText(in)
	}
	out.Usage = core.Usage{PromptTokens: total, TotalTokens: total}
	return out, nil
}

var stopwords = map[string]struct{}{}

func init() {
	for _, w := range strings.Fields(`a an the of to in on for and or is are was were be been am i me my you your
	we our it its this that these those please kindly could would can will just tell hey hi hello thanks thank
	do does did so very really what's whats what which who give`) {
		stopwords[w] = struct{}{}
	}
}

// Words splits text into normalised content words.
func Words(s string) []string {
	f := strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '\''
	})
	out := f[:0]
	for _, w := range f {
		w = strings.Trim(w, "'")
		if _, stop := stopwords[w]; stop || w == "" {
			continue
		}
		out = append(out, w)
	}
	return out
}

// Vector computes the deterministic embedding of s.
func Vector(s string, dims int) []float32 {
	v := make([]float64, dims)
	add := func(tok string, w float64) {
		h := fnv.New64a()
		_, _ = h.Write([]byte(tok))
		sum := h.Sum64()
		idx := int(sum % uint64(dims)) //nolint:gosec // dims is small and positive
		sign := 1.0
		if (sum>>63)&1 == 1 {
			sign = -1
		}
		v[idx] += sign * w
	}
	words := Words(s)
	for i, w := range words {
		add(w, 1)
		if i > 0 {
			add(words[i-1]+"\x00"+w, 0.5)
		}
	}
	var norm float64
	for _, x := range v {
		norm += x * x
	}
	out := make([]float32, dims)
	if norm == 0 {
		// Empty / stopword-only text: stable unit vector derived from the raw string.
		h := sha256.Sum256([]byte(s))
		out[binary.BigEndian.Uint32(h[:4])%uint32(dims)] = 1 //nolint:gosec // dims is small and positive
		return out
	}
	inv := 1 / math.Sqrt(norm)
	for i, x := range v {
		out[i] = float32(x * inv)
	}
	return out
}
