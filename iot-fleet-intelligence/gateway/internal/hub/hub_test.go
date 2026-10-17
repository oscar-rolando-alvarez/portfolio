package hub

import (
	"fmt"
	"testing"
)

func snap(i int) Frame {
	return Frame{Event: "snapshot", ID: uint64(i), Data: fmt.Appendf(nil, `{"seq":%d}`, i)}
}

func TestDownsamplingAndCellsOptOut(t *testing.T) {
	h := New(64, 10, 10)
	c := h.Subscribe(Options{Tenant: "acme", Every: 5, Cells: false})
	other := h.Subscribe(Options{Tenant: "globex", Every: 1, Cells: true})
	for i := 1; i <= 10; i++ {
		h.Publish("acme", snap(i))
		h.Publish("acme", Frame{Event: "cells", Data: []byte(`{}`)})
	}
	h.Publish("acme", Frame{Event: "incident", Data: []byte(`{}`)})
	var got []uint64
	for len(c.Frames()) > 0 {
		f := <-c.Frames()
		if f.Event == "snapshot" {
			got = append(got, f.ID)
		}
	}
	if fmt.Sprint(got) != "[1 6]" {
		t.Fatalf("every=5 must deliver snapshots 1 and 6, got %v", got)
	}
	if len(other.Frames()) != 0 {
		t.Fatal("tenant isolation broken")
	}
}

func TestSlowClientDropsOldestThenIsKicked(t *testing.T) {
	h := New(4, 3, 10)
	c := h.Subscribe(Options{Tenant: "acme"})
	for i := 1; i <= 6; i++ { // 4 fit, then 2 overflows (oldest dropped)
		h.Publish("acme", snap(i))
	}
	if c.Dropped() != 2 {
		t.Fatalf("dropped=%d", c.Dropped())
	}
	first := <-c.Frames()
	if first.ID != 3 {
		t.Fatalf("latest-wins: oldest kept should be 3, got %d", first.ID)
	}
	h.Publish("acme", snap(7)) // fits (queue had room): overflow streak resets
	h.Publish("acme", snap(8))
	h.Publish("acme", snap(9))
	h.Publish("acme", snap(10))
	select {
	case <-c.Kicked():
	default:
		t.Fatal("client should be kicked after 3 consecutive overflows")
	}
	st := h.Stats()
	if st.Clients != 0 || st.Kicked != 1 || st.Dropped < 4 || st.Published != 10 {
		t.Fatalf("stats: %+v", st)
	}
}

func TestMaxClients(t *testing.T) {
	h := New(1, 1, 1)
	a := h.Subscribe(Options{Tenant: "x"})
	if a == nil || h.Subscribe(Options{Tenant: "x"}) != nil {
		t.Fatal("second client must be refused")
	}
	h.Unsubscribe(a)
	if h.Subscribe(Options{Tenant: "x"}) == nil {
		t.Fatal("slot must be released")
	}
}

func BenchmarkPublish100Clients(b *testing.B) {
	h := New(32, 1<<30, 1000)
	for range 100 {
		c := h.Subscribe(Options{Tenant: "acme"})
		go func() {
			for range c.Frames() {
			}
		}()
	}
	f := snap(1)
	b.ResetTimer()
	for range b.N {
		h.Publish("acme", f)
	}
}
