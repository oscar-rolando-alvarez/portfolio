package core

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestChatRequestRoundTripKeepsUnknownFields(t *testing.T) {
	in := `{"model":"m","messages":[{"role":"user","content":[{"type":"text","text":"hi a@b.io"},{"type":"image_url","image_url":{"url":"data:x"}}]}],"tools":[{"type":"function"}],"seed":7,"response_format":{"type":"json_object"}}`
	var r ChatRequest
	if err := json.Unmarshal([]byte(in), &r); err != nil {
		t.Fatal(err)
	}
	if !r.HasTools() || len(r.Extra) != 3 {
		t.Fatalf("extra=%v", r.Extra)
	}
	if got := r.Messages[0].Content.String(); got != "hi a@b.io" {
		t.Fatalf("text=%q", got)
	}
	r.Messages[0].Content.MapText(strings.ToUpper)
	out, err := json.Marshal(r)
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	for _, want := range []string{`"seed":7`, `"response_format"`, `"tools"`, `"HI A@B.IO"`, `"image_url":{"url":"data:x"}`} {
		if !strings.Contains(s, want) {
			t.Fatalf("missing %s in %s", want, s)
		}
	}
}

func TestContentForms(t *testing.T) {
	var m Message
	if err := json.Unmarshal([]byte(`{"role":"assistant","content":null,"tool_calls":[{"id":"1"}]}`), &m); err != nil {
		t.Fatal(err)
	}
	if !m.Content.Null {
		t.Fatal("null content not preserved")
	}
	b, _ := json.Marshal(m)
	if !strings.Contains(string(b), `"content":null`) {
		t.Fatalf("got %s", b)
	}
	if err := json.Unmarshal([]byte(`{"role":"user","content":42}`), &m); err == nil {
		t.Fatal("numeric content must be rejected")
	}
}

func TestValidate(t *testing.T) {
	two := 2.5
	bad := []ChatRequest{
		{},
		{Model: "m"},
		{Model: "m", Messages: []Message{{Role: "wizard"}}},
		{Model: "m", Messages: []Message{{Role: "user"}}, Temperature: &two},
	}
	for i, r := range bad {
		if r.Validate() == nil {
			t.Errorf("case %d should fail", i)
		}
	}
	ok := ChatRequest{Model: "m", Messages: []Message{{Role: "user", Content: TextContent("x")}}}
	if err := ok.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestEmbeddingInputs(t *testing.T) {
	r := EmbeddingRequest{Input: json.RawMessage(`"a"`)}
	if in, err := r.Inputs(); err != nil || len(in) != 1 {
		t.Fatal(in, err)
	}
	r.Input = json.RawMessage(`["a","b"]`)
	if in, err := r.Inputs(); err != nil || len(in) != 2 {
		t.Fatal(in, err)
	}
	r.Input = json.RawMessage(`[1,2]`)
	if _, err := r.Inputs(); err == nil {
		t.Fatal("token arrays are not supported and must be rejected")
	}
}

func TestErrorMapping(t *testing.T) {
	if e := UpstreamError(503, "x", 0); !e.Retryable || e.Status != 502 {
		t.Fatalf("%+v", e)
	}
	if e := UpstreamError(400, "x", 0); e.Retryable || e.Status != 400 {
		t.Fatalf("%+v", e)
	}
	if IsRetryable(nil) {
		t.Fatal("nil is not retryable")
	}
}
