import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoEngine } from "./demo";
import type { StreamAction } from "./reducer";
import { startLive } from "./sources";

class FakeEventSource {
  static CLOSED = 2;
  static last: FakeEventSource;
  readyState = 1;
  url: string;
  listeners = new Map<string, (e: MessageEvent) => void>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, fn);
  }
  emit(type: string, data: unknown) {
    this.listeners.get(type)?.(new MessageEvent(type, { data: typeof data === "string" ? data : JSON.stringify(data) }));
  }
  close() {
    this.closed = true;
  }
}

describe("live SSE source", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps gateway events to reducer actions and tolerates bad frames", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const actions: StreamAction[] = [];
    const src = startLive("acme-utilities", (a) => actions.push(a));
    const es = FakeEventSource.last;
    expect(es.url).toBe("/api/stream?tenant=acme-utilities");
    const e = new DemoEngine("acme-utilities", 300, 1_800_000_000_000);
    es.onopen?.();
    es.emit("hello", { ...e.hello(300), incidents: undefined, history: undefined });
    es.emit("snapshot", e.snapshot(301));
    es.emit("cells", e.cellFrame(301));
    es.emit("incident", e.incidents(301)[0]);
    es.emit("snapshot", "{not json");
    es.onerror?.();
    es.readyState = FakeEventSource.CLOSED;
    es.onerror?.();
    src.stop();
    expect(es.closed).toBe(true);
    expect(actions.map((a) => (a.type === "status" ? `status:${a.status}` : a.type))).toEqual([
      "status:open",
      "hello",
      "snapshot",
      "cells",
      "incident",
      "status:reconnecting",
      "status:error",
    ]);
    const hello = actions[1] as Extract<StreamAction, { type: "hello" }>;
    expect(hello.hello.incidents).toEqual([]);
  });
});
