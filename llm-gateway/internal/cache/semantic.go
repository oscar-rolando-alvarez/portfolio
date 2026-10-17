package cache

import (
	"math"
	"sync"
	"time"
)

// SemanticIndex is an in-memory, per-namespace vector index using exact
// (brute-force) cosine similarity over L2-normalised vectors. Each namespace
// is a bounded ring buffer and the total number of vectors is capped: when
// the cap is exceeded the oldest namespaces are evicted first (multi-turn
// conversations create many small namespaces). Memory is therefore bounded by
// maxEntries*dims*4 bytes. Brute force is the right trade-off up to ~10^4
// vectors per namespace (see BenchmarkSemanticSearch); beyond that an ANN index such as
// HNSW or Redis/Valkey vector search is the documented next step.
type SemanticIndex struct {
	mu         sync.RWMutex
	spaces     map[string]*space
	order      []string // namespace insertion order, for eviction
	total      int      // vectors across all namespaces
	maxPerNS   int
	maxEntries int
	now        func() time.Time
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

// defaultMaxEntries caps the vectors held in memory (about 50 MB at 256
// dimensions, 300 MB at 1536).
const defaultMaxEntries = 50_000

// SetMaxEntries overrides the global vector cap (tests, tuning).
func (x *SemanticIndex) SetMaxEntries(n int) {
	x.mu.Lock()
	defer x.mu.Unlock()
	if n > 0 {
		x.maxEntries = n
	}
}

// NewSemanticIndex creates an index holding up to maxPerNS vectors per namespace.
func NewSemanticIndex(maxPerNS int, now func() time.Time) *SemanticIndex {
	if maxPerNS <= 0 {
		maxPerNS = 2048
	}
	if now == nil {
		now = time.Now
	}
	return &SemanticIndex{spaces: map[string]*space{}, maxPerNS: maxPerNS, maxEntries: defaultMaxEntries, now: now}
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
		x.order = append(x.order, ns)
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
		x.total++
		x.evict(ns)
		return
	}
	s.entries[s.next] = e
	s.next = (s.next + 1) % x.maxPerNS
}

// evict drops the oldest namespaces (never keep) until the cap is respected.
func (x *SemanticIndex) evict(keep string) {
	for x.total > x.maxEntries && len(x.order) > 0 {
		victim := x.order[0]
		x.order = x.order[1:]
		if victim == keep {
			x.order = append(x.order, victim)
			if len(x.order) == 1 {
				return
			}
			continue
		}
		if sp, ok := x.spaces[victim]; ok {
			x.total -= len(sp.entries)
			delete(x.spaces, victim)
		}
	}
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

// Namespaces returns the number of namespaces held.
func (x *SemanticIndex) Namespaces() int {
	x.mu.RLock()
	defer x.mu.RUnlock()
	return len(x.spaces)
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
