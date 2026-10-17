package sched

import (
	"slices"
	"testing"
)

func schedulers(n int) map[string]Scheduler {
	return map[string]Scheduler{
		"wheel": NewWheel(64, 100),
		"heap":  NewHeap(n, 100),
	}
}

func TestSchedulersFireAtTheRightTick(t *testing.T) {
	for name, s := range schedulers(8) {
		t.Run(name, func(t *testing.T) {
			s.Schedule(1, 103)
			s.Schedule(2, 101)
			s.Schedule(3, 103)
			s.Schedule(4, 50) // in the past -> next tick
			if s.Len() != 4 {
				t.Fatalf("len=%d", s.Len())
			}
			fired := map[uint64][]uint32{}
			for range 5 {
				tick := s.Now()
				s.Advance(func(d uint32) { fired[tick] = append(fired[tick], d) })
			}
			got101 := fired[101]
			slices.Sort(got101)
			if !slices.Equal(got101, []uint32{2, 4}) {
				t.Fatalf("tick 101: %v", got101)
			}
			got103 := fired[103]
			slices.Sort(got103)
			if !slices.Equal(got103, []uint32{1, 3}) {
				t.Fatalf("tick 103: %v", got103)
			}
			if s.Len() != 0 {
				t.Fatalf("pending=%d", s.Len())
			}
		})
	}
}

func TestReschedulingFromCallback(t *testing.T) {
	for name, s := range schedulers(4) {
		t.Run(name, func(t *testing.T) {
			s.Schedule(7, 101)
			count := 0
			for range 30 {
				s.Advance(func(d uint32) {
					count++
					s.Schedule(d, s.Now()+3) // every 3 ticks
				})
			}
			// ticks 101,104,...,128 -> 10 firings within 30 ticks starting at 100
			if count != 10 {
				t.Fatalf("count=%d", count)
			}
		})
	}
}

func TestWheelClampsBeyondHorizon(t *testing.T) {
	w := NewWheel(8, 0) // size 16, horizon 15
	w.Schedule(1, 1000)
	fired := uint64(0)
	for range 20 {
		tick := w.Now()
		w.Advance(func(uint32) { fired = tick })
	}
	if fired != w.Horizon() {
		t.Fatalf("fired at %d want %d", fired, w.Horizon())
	}
}

func benchmarkScheduler(b *testing.B, mk func(n int) Scheduler) {
	const devices = 1_000_000
	const interval = 300
	s := mk(devices)
	for d := range uint32(devices) {
		s.Schedule(d, uint64(d%interval)+1)
	}
	b.ReportAllocs()
	b.ResetTimer()
	fired := 0
	for fired < b.N {
		s.Advance(func(d uint32) {
			fired++
			s.Schedule(d, s.Now()+interval)
		})
	}
	b.ReportMetric(float64(fired)/b.Elapsed().Seconds(), "reschedules/s")
}

func BenchmarkWheel1M(b *testing.B) {
	benchmarkScheduler(b, func(int) Scheduler { return NewWheel(4096, 0) })
}

func BenchmarkHeap1M(b *testing.B) {
	benchmarkScheduler(b, func(n int) Scheduler { return NewHeap(n, 0) })
}
