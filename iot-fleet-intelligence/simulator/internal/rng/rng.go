// Package rng provides a tiny counter-based pseudo random generator.
//
// The simulator never keeps a mutable RNG per device. Instead, every random
// draw is derived from (seed, device index, sequence number). This makes each
// event a pure function of its coordinates: the output is reproducible no
// matter how devices are sharded across goroutines or in which order shards
// are scheduled, and it costs zero bytes of per-device state.
package rng

import "math"

const (
	golden = 0x9e3779b97f4a7c15
	mulA   = 0xbf58476d1ce4e5b9
	mulB   = 0x94d049bb133111eb
)

// Mix is the splitmix64 finalizer: a fast, well-distributed 64-bit hash.
func Mix(x uint64) uint64 {
	x += golden
	x = (x ^ (x >> 30)) * mulA
	x = (x ^ (x >> 27)) * mulB
	return x ^ (x >> 31)
}

// Stream is a splitmix64 generator seeded from event coordinates. It is a
// value type so it lives on the stack of the event generator.
type Stream struct{ s uint64 }

// New derives a stream from a global seed and two coordinates.
func New(seed, a, b uint64) Stream {
	return Stream{s: Mix(seed ^ Mix(a^Mix(b)))}
}

// Uint64 returns the next 64 random bits.
func (r *Stream) Uint64() uint64 {
	r.s += golden
	z := r.s
	z = (z ^ (z >> 30)) * mulA
	z = (z ^ (z >> 27)) * mulB
	return z ^ (z >> 31)
}

// Float64 returns a uniform float in [0, 1).
func (r *Stream) Float64() float64 {
	return float64(r.Uint64()>>11) / (1 << 53)
}

// Intn returns a uniform int in [0, n). n must be > 0.
func (r *Stream) Intn(n int) int {
	return int(r.Uint64() % uint64(n))
}

// Bool returns true with probability p.
func (r *Stream) Bool(p float64) bool { return r.Float64() < p }

// Norm returns a standard normal sample (Box-Muller, one branch).
func (r *Stream) Norm() float64 {
	u1 := r.Float64()
	if u1 < 1e-12 {
		u1 = 1e-12
	}
	u2 := r.Float64()
	return math.Sqrt(-2*math.Log(u1)) * math.Cos(2*math.Pi*u2)
}
