package sink

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strconv"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
)

// SQSAPI is the subset of the SQS client the sink needs (mockable).
type SQSAPI interface {
	SendMessageBatch(ctx context.Context, in *sqs.SendMessageBatchInput, opts ...func(*sqs.Options)) (*sqs.SendMessageBatchOutput, error)
}

// SQSConfig configures the SQS sink.
type SQSConfig struct {
	QueueURL string
	Bundle   int // events per message (newline-delimited); amortises request cost
	Workers  int
}

// SQS sends bundles of events with SendMessageBatch (10 messages per call).
type SQS struct {
	api    SQSAPI
	cfg    SQSConfig
	jobs   chan []types.SendMessageBatchRequestEntry
	wg     sync.WaitGroup
	mu     sync.Mutex
	first  error
	cur    bytes.Buffer
	inCur  int
	batch  []types.SendMessageBatchRequestEntry
	nextID int
}

// NewSQSFromEnv builds the sink with the default AWS credential chain.
// AWS_ENDPOINT_URL / AWS_ENDPOINT_URL_SQS point it at a local emulator.
func NewSQSFromEnv(ctx context.Context, cfg SQSConfig) (*SQS, error) {
	awsCfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, err
	}
	return NewSQS(ctx, sqs.NewFromConfig(awsCfg), cfg), nil
}

// NewSQS builds the sink around any SQSAPI implementation. ctx bounds the
// lifetime of the background senders' requests.
func NewSQS(ctx context.Context, api SQSAPI, cfg SQSConfig) *SQS {
	if cfg.Bundle <= 0 {
		cfg.Bundle = 1
	}
	if cfg.Workers <= 0 {
		cfg.Workers = 8
	}
	s := &SQS{api: api, cfg: cfg, jobs: make(chan []types.SendMessageBatchRequestEntry, cfg.Workers*2)}
	for range cfg.Workers {
		s.wg.Add(1)
		go s.worker(context.WithoutCancel(ctx))
	}
	return s
}

func (s *SQS) worker(ctx context.Context) {
	defer s.wg.Done()
	for entries := range s.jobs {
		out, err := s.api.SendMessageBatch(ctx, &sqs.SendMessageBatchInput{
			QueueUrl: aws.String(s.cfg.QueueURL), Entries: entries,
		})
		if err == nil && out != nil && len(out.Failed) > 0 {
			err = fmt.Errorf("sqs: %d messages failed, first: %s", len(out.Failed), aws.ToString(out.Failed[0].Message))
		}
		if err != nil {
			s.mu.Lock()
			if s.first == nil {
				s.first = err
			}
			s.mu.Unlock()
		}
	}
}

// Write implements Sink.
func (s *SQS) Write(_ context.Context, recs []Record) error {
	s.mu.Lock()
	err := s.first
	s.mu.Unlock()
	if err != nil {
		return err
	}
	for _, r := range recs {
		if s.inCur > 0 {
			s.cur.WriteByte('\n')
		}
		s.cur.Write(r.Value)
		s.inCur++
		if s.inCur >= s.cfg.Bundle {
			s.flushMessage()
		}
	}
	return nil
}

func (s *SQS) flushMessage() {
	if s.inCur == 0 {
		return
	}
	s.nextID++
	s.batch = append(s.batch, types.SendMessageBatchRequestEntry{
		Id:          aws.String(strconv.Itoa(s.nextID)),
		MessageBody: aws.String(s.cur.String()),
	})
	s.cur.Reset()
	s.inCur = 0
	if len(s.batch) == 10 {
		s.jobs <- s.batch
		s.batch = nil
	}
}

// Close flushes partial bundles and waits for in-flight sends.
func (s *SQS) Close(context.Context) error {
	s.flushMessage()
	if len(s.batch) > 0 {
		s.jobs <- s.batch
		s.batch = nil
	}
	close(s.jobs)
	s.wg.Wait()
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.first != nil {
		return errors.Join(errors.New("sqs sink"), s.first)
	}
	return nil
}
