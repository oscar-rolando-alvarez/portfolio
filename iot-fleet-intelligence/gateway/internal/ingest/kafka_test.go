package ingest

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/oscar-rolando-alvarez/portfolio/iot-fleet-intelligence/gateway/internal/agg"
)

type countingSink struct {
	mu      sync.Mutex
	tenants map[string]int
}

func (s *countingSink) Add(ev *agg.Event, _ int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tenants[ev.Tenant]++
	return true
}

func (s *countingSink) count(t string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.tenants[t]
}

// TestKafkaRoundTrip needs a broker: KAFKA_BOOTSTRAP=localhost:9092 go test ./internal/ingest/
func TestKafkaRoundTrip(t *testing.T) {
	brokers := os.Getenv("KAFKA_BOOTSTRAP")
	if brokers == "" {
		t.Skip("set KAFKA_BOOTSTRAP to run the Kafka integration test")
	}
	topic := fmt.Sprintf("gw-it-%d", time.Now().UnixNano())
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	prod, err := kgo.NewClient(kgo.SeedBrokers(brokers), kgo.AllowAutoTopicCreation(), kgo.DefaultProduceTopic(topic))
	if err != nil {
		t.Fatal(err)
	}
	defer prod.Close()
	var recs []*kgo.Record
	for i := range 50 {
		recs = append(recs, &kgo.Record{Value: fmt.Appendf(nil,
			`{"v":1,"tenant":"acme-utilities","device_id":"dev-%08d","cell_id":"310-260-1000-1","conn_state":"connected","rat":"LTE-M"}`, i)})
	}
	recs = append(recs, &kgo.Record{Value: []byte(`{not json`)})
	if err := prod.ProduceSync(ctx, recs...).FirstErr(); err != nil {
		t.Fatal(err)
	}

	sink := &countingSink{tenants: map[string]int{}}
	st := &Stats{}
	done := make(chan error, 1)
	runCtx, stop := context.WithCancel(ctx)
	go func() { done <- Run(runCtx, Config{Brokers: brokers, Topic: topic, FromStart: true}, sink, st) }()
	for sink.count("acme-utilities") < 50 && ctx.Err() == nil {
		time.Sleep(50 * time.Millisecond)
	}
	stop()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if sink.count("acme-utilities") != 50 || st.Invalid.Load() != 1 || st.Records.Load() != 51 || !st.Ready.Load() {
		t.Fatalf("consumed=%d invalid=%d records=%d ready=%v", sink.count("acme-utilities"), st.Invalid.Load(), st.Records.Load(), st.Ready.Load())
	}
}
