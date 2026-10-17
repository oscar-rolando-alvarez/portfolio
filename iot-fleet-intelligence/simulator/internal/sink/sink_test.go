package sink

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
)

func recs(n int) []Record {
	out := make([]Record, n)
	for i := range out {
		out[i] = Record{Key: []byte("cell"), Value: []byte(`{"i":` + string(rune('0'+i%10)) + `}`)}
	}
	return out
}

func TestLinesFile(t *testing.T) {
	p := filepath.Join(t.TempDir(), "out.jsonl")
	l, err := NewFile(p)
	if err != nil {
		t.Fatal(err)
	}
	if err := l.Write(context.Background(), recs(3)); err != nil {
		t.Fatal(err)
	}
	if err := l.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(p)
	if strings.Count(string(data), "\n") != 3 {
		t.Fatalf("got %q", data)
	}
}

func TestDiscardCounts(t *testing.T) {
	d := &Discard{}
	_ = d.Write(context.Background(), recs(5))
	if d.Records.Load() != 5 || d.Bytes.Load() != 35 {
		t.Fatalf("records=%d bytes=%d", d.Records.Load(), d.Bytes.Load())
	}
}

type fakeSQS struct {
	mu      sync.Mutex
	calls   int
	bodies  []string
	failAll bool
}

func (f *fakeSQS) SendMessageBatch(_ context.Context, in *sqs.SendMessageBatchInput, _ ...func(*sqs.Options)) (*sqs.SendMessageBatchOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if f.failAll {
		return nil, errors.New("boom")
	}
	if len(in.Entries) > 10 {
		return nil, errors.New("too many entries")
	}
	for _, e := range in.Entries {
		f.bodies = append(f.bodies, aws.ToString(e.MessageBody))
	}
	return &sqs.SendMessageBatchOutput{Successful: make([]types.SendMessageBatchResultEntry, len(in.Entries))}, nil
}

func TestSQSBundlesAndBatches(t *testing.T) {
	api := &fakeSQS{}
	s := NewSQS(context.Background(), api, SQSConfig{QueueURL: "q", Bundle: 4, Workers: 2})
	if err := s.Write(context.Background(), recs(45)); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	// 45 events / 4 per message = 12 messages -> 2 SendMessageBatch calls
	if len(api.bodies) != 12 || api.calls != 2 {
		t.Fatalf("messages=%d calls=%d", len(api.bodies), api.calls)
	}
	lines := 0
	for _, b := range api.bodies {
		lines += bytes.Count([]byte(b), []byte("\n")) + 1
	}
	if lines != 45 {
		t.Fatalf("events in bodies=%d", lines)
	}
}

func TestSQSPropagatesErrors(t *testing.T) {
	s := NewSQS(context.Background(), &fakeSQS{failAll: true}, SQSConfig{QueueURL: "q", Bundle: 1, Workers: 1})
	_ = s.Write(context.Background(), recs(10))
	if err := s.Close(context.Background()); err == nil {
		t.Fatal("expected error")
	}
}
