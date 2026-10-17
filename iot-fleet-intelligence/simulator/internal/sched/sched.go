// Package sched contains the discrete-time schedulers that decide which
// virtual devices report at each simulation tick.
//
// Simulating millions of devices with one goroutine (or one timer) per device
// is wasteful: each goroutine costs >= 2 KiB of stack plus runtime scheduling
// overhead. Instead the simulator keeps device state in flat arrays and uses a
// scheduler that only stores a uint32 device index per pending report.
//
// Two implementations are provided so their trade-offs can be benchmarked:
//
//   - Wheel: a hashed timing wheel. O(1) schedule and O(1) amortised pop.
//     Requires the scheduling horizon to fit in the wheel (reports are at most
//     a few hours apart, so a 2^14-slot wheel with 1 s ticks is plenty).
//   - Heap: a binary min-heap keyed by (tick, device). O(log n) per operation
//     but no horizon limit; useful for sparse or very long-horizon schedules.
package sched

// Scheduler hands out due device indices tick by tick.
type Scheduler interface {
	// Schedule enqueues dev to fire at tick at (at > Now()).
	Schedule(dev uint32, at uint64)
	// Advance calls fn for every device due at Now() and then moves to the
	// next tick. fn may call Schedule for future ticks.
	Advance(fn func(dev uint32))
	// Now returns the current tick.
	Now() uint64
	// Len returns the number of pending entries.
	Len() int
}

// Wheel is a single-level hashed timing wheel with 1-tick slots.
type Wheel struct {
	slots   [][]uint32
	mask    uint64
	now     uint64
	pending int
}

// NewWheel builds a wheel whose horizon is at least horizon ticks.
func NewWheel(horizon int, start uint64) *Wheel {
	size := 1
	for size <= horizon {
		size <<= 1
	}
	return &Wheel{slots: make([][]uint32, size), mask: uint64(size - 1), now: start}
}

// Horizon is the maximum distance (in ticks) a device can be scheduled ahead.
func (w *Wheel) Horizon() uint64 { return w.mask }

// Schedule implements Scheduler. Targets beyond the horizon are clamped so the
// wheel never wraps onto the slot currently being drained.
func (w *Wheel) Schedule(dev uint32, at uint64) {
	if at <= w.now {
		at = w.now + 1
	}
	if at-w.now > w.mask {
		at = w.now + w.mask
	}
	i := at & w.mask
	w.slots[i] = append(w.slots[i], dev)
	w.pending++
}

// Advance implements Scheduler.
func (w *Wheel) Advance(fn func(dev uint32)) {
	i := w.now & w.mask
	due := w.slots[i]
	w.pending -= len(due)
	for _, d := range due {
		fn(d)
	}
	// Keep the capacity: slots are reused every revolution, so steady state
	// performs no allocations at all.
	w.slots[i] = due[:0]
	w.now++
}

// Now implements Scheduler.
func (w *Wheel) Now() uint64 { return w.now }

// Len implements Scheduler.
func (w *Wheel) Len() int { return w.pending }

// Heap is a binary min-heap of packed (tick<<32 | device) keys.
type Heap struct {
	h   []uint64
	now uint64
}

// NewHeap returns an empty heap scheduler starting at tick start.
func NewHeap(capacity int, start uint64) *Heap {
	return &Heap{h: make([]uint64, 0, capacity), now: start}
}

// Schedule implements Scheduler.
func (q *Heap) Schedule(dev uint32, at uint64) {
	if at <= q.now {
		at = q.now + 1
	}
	q.h = append(q.h, at<<32|uint64(dev))
	q.up(len(q.h) - 1)
}

// Advance implements Scheduler.
func (q *Heap) Advance(fn func(dev uint32)) {
	for len(q.h) > 0 && q.h[0]>>32 <= q.now {
		top := q.h[0]
		last := len(q.h) - 1
		q.h[0] = q.h[last]
		q.h = q.h[:last]
		if last > 0 {
			q.down(0)
		}
		fn(uint32(top & 0xffffffff))
	}
	q.now++
}

// Now implements Scheduler.
func (q *Heap) Now() uint64 { return q.now }

// Len implements Scheduler.
func (q *Heap) Len() int { return len(q.h) }

func (q *Heap) up(i int) {
	for i > 0 {
		p := (i - 1) / 2
		if q.h[p] <= q.h[i] {
			return
		}
		q.h[p], q.h[i] = q.h[i], q.h[p]
		i = p
	}
}

func (q *Heap) down(i int) {
	n := len(q.h)
	for {
		l := 2*i + 1
		if l >= n {
			return
		}
		m := l
		if r := l + 1; r < n && q.h[r] < q.h[l] {
			m = r
		}
		if q.h[i] <= q.h[m] {
			return
		}
		q.h[i], q.h[m] = q.h[m], q.h[i]
		i = m
	}
}
