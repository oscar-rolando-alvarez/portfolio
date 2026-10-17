"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Currency } from "./format";
import { initialState, reducer, type StreamAction, type StreamState } from "./stream/reducer";
import type { StreamMode } from "./stream/types";
import { DEFAULT_ASSUMPTIONS, type Assumptions } from "./value";

export type RemediationAction = { kind: "approved" | "dispatched"; at: number; note?: string };

export interface Preferences {
  mode: StreamMode;
  tenant: string;
  currency: Currency;
  timeRange: 300 | 900; // seconds shown on live charts
  assumptions: Assumptions;
  actions: Record<string, RemediationAction>; // human-in-the-loop decisions (local only)
}

interface Store extends Preferences {
  stream: StreamState;
  liveAvailable: boolean;
  dispatch: (a: StreamAction) => void;
  setMode: (m: StreamMode) => void;
  setTenant: (t: string) => void;
  setCurrency: (c: Currency) => void;
  setTimeRange: (s: 300 | 900) => void;
  setAssumptions: (a: Partial<Assumptions>) => void;
  resetAssumptions: () => void;
  recordAction: (incidentId: string, action: RemediationAction) => void;
  setLiveAvailable: (v: boolean) => void;
  /** Bumped to ask the demo source to restart (e.g. "replay outage" from the command palette). */
  demoEpoch: { n: number; startT?: number };
  replayDemo: (startT?: number) => void;
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      mode: "demo",
      tenant: "acme-utilities",
      currency: "USD",
      timeRange: 900,
      assumptions: DEFAULT_ASSUMPTIONS,
      actions: {},
      stream: initialState(),
      liveAvailable: false,
      demoEpoch: { n: 0 },
      dispatch: (a) => set((s) => ({ stream: reducer(s.stream, a) })),
      setMode: (mode) => set({ mode }),
      setTenant: (tenant) => set({ tenant }),
      setCurrency: (currency) => set({ currency }),
      setTimeRange: (timeRange) => set({ timeRange }),
      setAssumptions: (a) => set((s) => ({ assumptions: { ...s.assumptions, ...a } })),
      resetAssumptions: () => set({ assumptions: DEFAULT_ASSUMPTIONS }),
      recordAction: (id, action) => set((s) => ({ actions: { ...s.actions, [id]: action } })),
      setLiveAvailable: (liveAvailable) => set({ liveAvailable }),
      replayDemo: (startT) => set((s) => ({ mode: "demo", demoEpoch: { n: s.demoEpoch.n + 1, startT } })),
    }),
    {
      name: "fleetintel-dashboard",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        mode: s.mode,
        tenant: s.tenant,
        currency: s.currency,
        timeRange: s.timeRange,
        assumptions: s.assumptions,
        actions: s.actions,
      }),
      skipHydration: true,
    },
  ),
);
