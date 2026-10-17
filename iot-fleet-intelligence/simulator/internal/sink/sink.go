// Package sink contains the outputs the simulator can stream telemetry to:
// newline-delimited JSON files/stdout, Apache Kafka (local KRaft or Amazon MSK)
// and Amazon SQS.
package sink

import (
	"bufio"
	"context"
	"io"
	"os"
	"sync/atomic"
)

// Record is a keyed telemetry event. Key is the partitioning key (cell id) so
// that every event of a cell lands on the same Kafka partition, which keeps
// per-cell windows local to one consumer.
type Record struct {
	Key   []byte
	Value []byte
}

// Sink consumes batches of records. Record slices are only valid for the
// duration of the call: asynchronous sinks must copy.
type Sink interface {
	Write(ctx context.Context, recs []Record) error
	Close(ctx context.Context) error
}

// Lines writes newline-delimited JSON to any writer.
type Lines struct {
	w      *bufio.Writer
	closer io.Closer
}

// NewFile opens path for writing ("-" means stdout).
func NewFile(path string) (*Lines, error) {
	if path == "-" || path == "" {
		return &Lines{w: bufio.NewWriterSize(os.Stdout, 1<<20)}, nil
	}
	f, err := os.Create(path) //nolint:gosec // operator-supplied output path
	if err != nil {
		return nil, err
	}
	return &Lines{w: bufio.NewWriterSize(f, 1<<20), closer: f}, nil
}

// NewWriter wraps an arbitrary writer (used by tests and benchmarks).
func NewWriter(w io.Writer) *Lines { return &Lines{w: bufio.NewWriterSize(w, 1<<20)} }

// Write implements Sink.
func (l *Lines) Write(_ context.Context, recs []Record) error {
	for _, r := range recs {
		if _, err := l.w.Write(r.Value); err != nil {
			return err
		}
		if err := l.w.WriteByte('\n'); err != nil {
			return err
		}
	}
	return nil
}

// Close implements Sink.
func (l *Lines) Close(context.Context) error {
	if err := l.w.Flush(); err != nil {
		return err
	}
	if l.closer != nil {
		return l.closer.Close()
	}
	return nil
}

// Discard counts records and drops them; used for pure generator benchmarks.
type Discard struct {
	Records atomic.Uint64
	Bytes   atomic.Uint64
}

// Write implements Sink.
func (d *Discard) Write(_ context.Context, recs []Record) error {
	var n uint64
	for _, r := range recs {
		n += uint64(len(r.Value))
	}
	d.Records.Add(uint64(len(recs)))
	d.Bytes.Add(n)
	return nil
}

// Close implements Sink.
func (d *Discard) Close(context.Context) error { return nil }
