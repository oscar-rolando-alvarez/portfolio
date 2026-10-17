package agg

import (
	"regexp"
	"slices"
	"sync"
	"sync/atomic"
)

var tenantRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,39}$`)

// Registry keeps one Aggregator per tenant. The number of tenants is capped so
// malformed or hostile input cannot grow memory without bound.
type Registry struct {
	mu         sync.RWMutex
	cfg        Config
	maxTenants int
	byTenant   map[string]*Aggregator
	rejected   atomic.Uint64
}

// NewRegistry builds a Registry.
func NewRegistry(cfg Config, maxTenants int) *Registry {
	if maxTenants <= 0 {
		maxTenants = 32
	}
	return &Registry{cfg: cfg, maxTenants: maxTenants, byTenant: map[string]*Aggregator{}}
}

// Add routes an event to its tenant's aggregator. It returns false when the
// event was dropped (invalid tenant or tenant cap reached).
func (r *Registry) Add(ev *Event, size int) bool {
	a := r.Get(ev.Tenant)
	if a == nil {
		if !tenantRe.MatchString(ev.Tenant) || ev.DeviceID == "" {
			r.rejected.Add(1)
			return false
		}
		r.mu.Lock()
		a = r.byTenant[ev.Tenant]
		if a == nil {
			if len(r.byTenant) >= r.maxTenants {
				r.mu.Unlock()
				r.rejected.Add(1)
				return false
			}
			a = New(r.cfg)
			r.byTenant[ev.Tenant] = a
		}
		r.mu.Unlock()
	}
	a.Add(ev, size)
	return true
}

// Get returns the tenant's aggregator or nil.
func (r *Registry) Get(tenant string) *Aggregator {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.byTenant[tenant]
}

// Tenants lists known tenants (sorted).
func (r *Registry) Tenants() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]string, 0, len(r.byTenant))
	for t := range r.byTenant {
		out = append(out, t)
	}
	slices.Sort(out)
	return out
}

// Rejected counts events dropped by Add.
func (r *Registry) Rejected() uint64 { return r.rejected.Load() }
