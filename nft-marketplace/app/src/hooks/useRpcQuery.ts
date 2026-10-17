"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";

export type QueryState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "success"; data: T };

type Settled<T> = { key: string; nonce: number } & (
  | { status: "error"; error: Error }
  | { status: "success"; data: T }
);

/**
 * Minimal client-side data loader. `key` identifies the request; pass `null` to skip.
 * Results are discarded if the key changes before the request settles.
 */
export function useRpcQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
): QueryState<T> & { refetch: () => void } {
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const run = useEffectEvent(fetcher);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    run().then(
      (data) => {
        if (!cancelled) setSettled({ key, nonce, status: "success", data });
      },
      (error: unknown) => {
        if (!cancelled) {
          setSettled({
            key,
            nonce,
            status: "error",
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  if (key === null) return { status: "idle", refetch };
  if (!settled || settled.key !== key || settled.nonce !== nonce) {
    return { status: "loading", refetch };
  }
  return settled.status === "success"
    ? { status: "success", data: settled.data, refetch }
    : { status: "error", error: settled.error, refetch };
}
