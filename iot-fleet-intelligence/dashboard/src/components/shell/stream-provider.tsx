"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DEFAULT_START_T } from "@/lib/stream/demo";
import { startDemo, startLive, type Source } from "@/lib/stream/sources";
import { useStore } from "@/lib/store";

const STORAGE_KEY = "fleetintel-dashboard";

/**
 * Owns the data source lifecycle: rehydrates preferences, discovers whether a
 * live gateway is configured (/api/config), and (re)starts the demo or live
 * source whenever mode, tenant or a demo replay changes.
 *
 * URL overrides make every state linkable and reproducible:
 * ?mode=demo|live, ?tenant=…, ?demoAt=<scenario second>.
 */
export function StreamProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const mode = useStore((s) => s.mode);
  const tenant = useStore((s) => s.tenant);
  const epoch = useStore((s) => s.demoEpoch);
  const dispatch = useStore((s) => s.dispatch);
  const [demoAt, setDemoAt] = useState<number | undefined>(undefined);

  useEffect(() => {
    let firstVisit = true;
    try {
      firstVisit = window.localStorage.getItem(STORAGE_KEY) === null;
    } catch {
      /* storage blocked: behave like a first visit */
    }
    void useStore.persist.rehydrate();
    const params = new URLSearchParams(window.location.search);
    const store = useStore.getState();
    const urlMode = params.get("mode");
    const urlTenant = params.get("tenant");
    const at = params.get("demoAt");
    if (urlTenant) store.setTenant(urlTenant);
    if (at !== null && Number.isFinite(Number(at))) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of URL overrides on mount
      setDemoAt(Number(at));
      store.setMode("demo");
    }
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : { liveAvailable: false }))
      .catch(() => ({ liveAvailable: false }))
      .then((cfg: { liveAvailable?: boolean; defaultMode?: "live" | "demo" }) => {
        const s = useStore.getState();
        s.setLiveAvailable(!!cfg.liveAvailable);
        if (at === null) {
          if (urlMode === "live" || urlMode === "demo") s.setMode(urlMode === "live" && !cfg.liveAvailable ? "demo" : urlMode);
          else if (firstVisit && cfg.defaultMode) s.setMode(cfg.defaultMode);
          else if (s.mode === "live" && !cfg.liveAvailable) s.setMode("demo");
        }
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!ready) return;
    dispatch({ type: "reset", mode, tenant });
    let src: Source;
    if (mode === "live") {
      src = startLive(tenant, dispatch);
    } else {
      src = startDemo(tenant, dispatch, epoch.startT ?? demoAt ?? DEFAULT_START_T);
    }
    return () => src.stop();
  }, [ready, mode, tenant, epoch, demoAt, dispatch]);

  return <>{children}</>;
}
