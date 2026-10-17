// Package hub fans pre-encoded frames out to SSE clients with per-client
// backpressure.
//
// Frames are serialised once per tenant per second, independent of the number
// of clients. Each client owns a small bounded queue: when it is full the
// oldest frame is dropped (snapshots are latest-wins, so a slow client skips
// stale seconds instead of lagging behind), and a client that keeps
// overflowing is disconnected. EventSource reconnects automatically and the
// "hello" frame resynchronises it, so dropping is always safe.
package hub

import (
	"sync"
	"sync/atomic"
)

// Frame is one SSE message. Data must be a single line (compact JSON).
type Frame struct {
	Event string
	ID    uint64
	Data  []byte
}

// Options are per-client subscription settings.
type Options struct {
	Tenant string
	Every  int  // deliver every Nth snapshot (client-side downsampling), >= 1
	Cells  bool // include the (larger) per-cell frames
}

// Client is one subscriber.
type Client struct {
	opts      Options
	ch        chan Frame
	snapshots uint64
	overflows int
	dropped   atomic.Uint64
	kicked    chan struct{}
	once      sync.Once
}

// Frames is the client's queue.
func (c *Client) Frames() <-chan Frame { return c.ch }

// Kicked is closed when the hub disconnects a client that cannot keep up.
func (c *Client) Kicked() <-chan struct{} { return c.kicked }

// Dropped counts frames dropped for this client.
func (c *Client) Dropped() uint64 { return c.dropped.Load() }

// Stats are hub-wide counters for /metrics.
type Stats struct {
	Clients   int
	Published uint64
	Dropped   uint64
	Kicked    uint64
}

// Hub is safe for concurrent use.
type Hub struct {
	pub         sync.Mutex // serialises publishers (ticker, incident poller)
	mu          sync.RWMutex
	clients     map[*Client]struct{}
	buffer      int
	maxOverflow int
	maxClients  int
	published   atomic.Uint64
	dropped     atomic.Uint64
	kicked      atomic.Uint64
}

// New builds a hub. buffer is the per-client queue length; a client is
// disconnected after maxOverflow consecutive overflows.
func New(buffer, maxOverflow, maxClients int) *Hub {
	return &Hub{
		clients: map[*Client]struct{}{}, buffer: max(buffer, 1),
		maxOverflow: max(maxOverflow, 1), maxClients: max(maxClients, 1),
	}
}

// Subscribe registers a client; it returns nil when the hub is full.
func (h *Hub) Subscribe(o Options) *Client {
	o.Every = max(o.Every, 1)
	c := &Client{opts: o, ch: make(chan Frame, h.buffer), kicked: make(chan struct{})}
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.clients) >= h.maxClients {
		return nil
	}
	h.clients[c] = struct{}{}
	return c
}

// Unsubscribe removes a client.
func (h *Hub) Unsubscribe(c *Client) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
}

// Publish offers f to every client of tenant without ever blocking.
func (h *Hub) Publish(tenant string, f Frame) {
	h.pub.Lock()
	defer h.pub.Unlock()
	h.published.Add(1)
	h.mu.RLock()
	var kick []*Client
	for c := range h.clients {
		if c.opts.Tenant == tenant && !h.offer(c, f) {
			kick = append(kick, c)
		}
	}
	h.mu.RUnlock()
	for _, c := range kick {
		h.Unsubscribe(c)
		c.once.Do(func() { close(c.kicked) })
		h.kicked.Add(1)
	}
}

// offer enqueues f; it returns false when the client should be disconnected.
// Publishers are serialised by h.pub, so per-client counters need no lock.
func (h *Hub) offer(c *Client, f Frame) bool {
	switch f.Event {
	case "snapshot":
		c.snapshots++
		if (c.snapshots-1)%uint64(c.opts.Every) != 0 {
			return true
		}
	case "cells":
		if !c.opts.Cells {
			return true
		}
	}
	select {
	case c.ch <- f:
		c.overflows = 0
		return true
	default:
	}
	// Queue full: drop the oldest frame, enqueue the newest.
	select {
	case <-c.ch:
		c.dropped.Add(1)
		h.dropped.Add(1)
	default:
	}
	select {
	case c.ch <- f:
	default:
		c.dropped.Add(1)
		h.dropped.Add(1)
	}
	c.overflows++
	return c.overflows < h.maxOverflow
}

// Stats returns hub counters.
func (h *Hub) Stats() Stats {
	h.mu.RLock()
	n := len(h.clients)
	h.mu.RUnlock()
	return Stats{Clients: n, Published: h.published.Load(), Dropped: h.dropped.Load(), Kicked: h.kicked.Load()}
}
