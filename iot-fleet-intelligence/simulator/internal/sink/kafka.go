package sink

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
)

// KafkaConfig configures the Kafka producer.
type KafkaConfig struct {
	Brokers     []string
	Topic       string
	CreateTopic bool
	Partitions  int32
}

// Kafka produces records asynchronously with batching and zstd compression.
type Kafka struct {
	cl    *kgo.Client
	mu    sync.Mutex
	first error
}

// NewKafka connects to the cluster and optionally creates the topic.
func NewKafka(ctx context.Context, cfg KafkaConfig) (*Kafka, error) {
	cl, err := kgo.NewClient(
		kgo.SeedBrokers(cfg.Brokers...),
		kgo.DefaultProduceTopic(cfg.Topic),
		kgo.ProducerLinger(5*time.Millisecond),
		kgo.ProducerBatchCompression(kgo.ZstdCompression()),
		kgo.ProducerBatchMaxBytes(1<<20),
		kgo.MaxBufferedRecords(200_000),
		// Partition by key (cell id) with the Java-compatible murmur2 hash.
		kgo.RecordPartitioner(kgo.StickyKeyPartitioner(nil)),
	)
	if err != nil {
		return nil, err
	}
	if cfg.CreateTopic {
		adm := kadm.NewClient(cl)
		resp, err := adm.CreateTopics(ctx, cfg.Partitions, 1, nil, cfg.Topic)
		if err != nil {
			cl.Close()
			return nil, fmt.Errorf("create topic: %w", err)
		}
		for _, r := range resp {
			if r.Err != nil && !errors.Is(r.Err, kerr.TopicAlreadyExists) {
				cl.Close()
				return nil, fmt.Errorf("create topic %s: %w", r.Topic, r.Err)
			}
		}
	}
	return &Kafka{cl: cl}, nil
}

// Write implements Sink. Produce blocks when the client buffer is full, which
// gives natural back-pressure to the simulation loop.
func (k *Kafka) Write(ctx context.Context, recs []Record) error {
	if err := k.err(); err != nil {
		return err
	}
	for _, r := range recs {
		rec := &kgo.Record{
			Key:   append([]byte(nil), r.Key...),
			Value: append([]byte(nil), r.Value...),
		}
		k.cl.Produce(ctx, rec, k.onDone)
	}
	return nil
}

func (k *Kafka) onDone(_ *kgo.Record, err error) {
	if err == nil {
		return
	}
	k.mu.Lock()
	if k.first == nil {
		k.first = err
	}
	k.mu.Unlock()
}

func (k *Kafka) err() error {
	k.mu.Lock()
	defer k.mu.Unlock()
	return k.first
}

// Close flushes outstanding records and closes the client.
func (k *Kafka) Close(ctx context.Context) error {
	defer k.cl.Close()
	if err := k.cl.Flush(ctx); err != nil {
		return err
	}
	return k.err()
}
