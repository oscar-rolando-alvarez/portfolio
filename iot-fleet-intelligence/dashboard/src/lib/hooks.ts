"use client";

import { useEffect, useState } from "react";
import { demoTenant } from "./stream/demo";
import { useStore } from "./store";

/** Fleet size: the demo tenant's catalogue size, or devices seen by the live gateway. */
export function useFleetSize(): number {
  const mode = useStore((s) => s.mode);
  const tenant = useStore((s) => s.tenant);
  const seen = useStore((s) => s.stream.latest?.devicesSeen ?? 0);
  return mode === "live" ? Math.max(seen, 1) : demoTenant(tenant).devices;
}

/**
 * Wall clock that re-renders every `ms` (for relative times). Returns 0 until
 * mounted so statically pre-rendered HTML never depends on the build time
 * (avoids hydration mismatches); callers treat 0 as "not yet known".
 */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first tick right after mount
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
