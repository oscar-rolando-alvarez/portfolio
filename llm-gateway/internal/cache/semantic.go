package cache

import (
	"math"
	"sync"
	"time"
)

// SemanticIndex is an in-memory, per-namespace vector index using exact
// (brute-force) cosine similarity over L2-normalised vectors. Each namespace
// is a bounded ring buffer, so memory is capped at maxPerNS*dims*4 bytes per
// namespace. Brute force is the right trade-off up to ~10^4 vectors per
// namespace (see BenchmarkSemanticSearch); beyond that an ANN index such as
// HNSW or Redis/Valkey vector search is the documented next step.
type SemanticIndex struct {
	mu       sync.RWMutex
	spaces   map[string]*space
	maxPerNS int
	now      func() time.Time
}

type entry struct {
	vec     []float32
	key     string
	expires time.Time
}

type space struct {
	entries []entry
	next    int
}

// NewSemanticIndex creates an index holding up to maxPerNS vectors per namespace.
func NewSemanticIndex(maxPerNS int, now func() time.Time) *SemanticIndex {
	if maxPerNS <= 0 {
		maxPerNS = 2048
	}
	if now == nil {
		now = time.Now
	}
	return &SemanticIndex{spaces: map[string]*space{}, maxPerNS: maxPerNS, now: now}
}

// Add inserts a vector pointing at a cache key.
func (x *SemanticIndex) Add(ns string, vec []float32, key string, ttl time.Duration) {
	var exp time.Time
	if ttl > 0 {
		exp = x.now().Add(ttl)
	}
	x.mu.Lock()
	defer x.mu.Unlock()
	s, ok := x.spaces[ns]
	if !ok {
		s = &space{}
		x.spaces[ns] = s
	}
	e := entry{vec: vec, key: key, expires: exp}
	// Replace an existing entry for the same key (refresh).
	for i := range s.entries {
		if s.entries[i].key == key {
			s.entries[i] = e
			return
		}
	}
	if len(s.entries) < x.maxPerNS {
		s.entries = append(s.entries, e)
		return
	}
	s.entries[s.next] = e
	s.next = (s.next + 1) % x.maxPerNS
}

// Search returns the most similar live entry with similarity >= threshold.
func (x *SemanticIndex) Search(ns string, vec []float32, threshold float32) (string, float32, bool) {
	now := x.now()
	x.mu.RLock()
	defer x.mu.RUnlock()
	s, ok := x.spaces[ns]
	if !ok {
		return "", 0, false
	}
	best, bestKey := float32(-math.MaxFloat32), ""
	for i := range s.entries {
		e := &s.entries[i]
		if !e.expires.IsZero() && now.After(e.expires) {
			continue
		}
		if sim := Dot(vec, e.vec); sim > best {
			best, bestKey = sim, e.key
		}
	}
	if bestKey == "" || best < threshold {
		return "", best, false
	}
	return bestKey, best, true
}

// Len returns the number of vectors in a namespace.
func (x *SemanticIndex) Len(ns string) int {
	x.mu.RLock()
	defer x.mu.RUnlock()
	if s, ok := x.spaces[ns]; ok {
		return len(s.entries)
	}
	return 0
}

// Dot computes the dot product (cosine similarity for unit vectors).
func Dot(a, b []float32) float32 {
	n := min(len(a), len(b))
	var s0, s1, s2, s3 float32
	i := 0
	for ; i+4 <= n; i += 4 {
		s0 += a[i] * b[i]
		s1 += a[i+1] * b[i+1]
		s2 += a[i+2] * b[i+2]
		s3 += a[i+3] * b[i+3]
	}
	for ; i < n; i++ {
		s0 += a[i] * b[i]
	}
	return s0 + s1 + s2 + s3
}
