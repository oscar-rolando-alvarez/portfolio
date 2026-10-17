"use client";

import { useSyncExternalStore } from "react";

let nowSeconds = Math.floor(Date.now() / 1000);
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    nowSeconds = Math.floor(Date.now() / 1000);
    timer = setInterval(() => {
      nowSeconds = Math.floor(Date.now() / 1000);
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Current unix time in seconds, ticking every second. Returns 0 during server rendering. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => nowSeconds,
    () => 0,
  );
}
