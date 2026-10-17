"use client";

import { useEffect, useRef, useState } from "react";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Animates between successive values (ease-out, ~600 ms) with requestAnimationFrame.
 * The formatted final value is always exposed to assistive tech; reduced motion jumps instantly.
 */
export function NumberTicker({
  value,
  format,
  className,
  duration = 600,
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
  duration?: number;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(value)) {
      from.current = value;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync jump when animation is disabled
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = a + (value - a) * eased;
      setShown(v);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else from.current = value;
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      from.current = value;
    };
  }, [value, duration]);

  return (
    <span className={className}>
      <span aria-hidden className="tabular">
        {format(shown)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
