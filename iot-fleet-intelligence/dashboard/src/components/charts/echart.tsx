"use client";

import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  DataZoomComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { cn } from "../ui/primitives";

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export type EChartsOption = echarts.EChartsCoreOption;

export interface ChartTheme {
  fg: string;
  fg2: string;
  fg3: string;
  grid: string;
  axis: string;
  surface: string;
  border: string;
  accent: string;
  series: [string, string, string, string, string];
  good: string;
  warning: string;
  serious: string;
  critical: string;
  reducedMotion: boolean;
}

export function readTheme(): ChartTheme {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    fg: v("--fg"),
    fg2: v("--fg-2"),
    fg3: v("--fg-3"),
    grid: v("--grid"),
    axis: v("--axis"),
    surface: v("--surface"),
    border: v("--border-strong"),
    accent: v("--accent"),
    series: [v("--series-1"), v("--series-2"), v("--series-3"), v("--series-4"), v("--series-5")],
    good: v("--good"),
    warning: v("--warning"),
    serious: v("--serious"),
    critical: v("--critical"),
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  };
}

/** Hex (#rgb / #rrggbb) to rgba() - canvas renderers need concrete colours, not color-mix(). */
export function alpha(hex: string, a: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Shared chrome: recessive grid/axes, tabular tooltip, theme-aware ink. */
export function baseOption(t: ChartTheme): EChartsOption {
  return {
    animation: !t.reducedMotion,
    animationDuration: 400,
    animationDurationUpdate: 300,
    animationEasingUpdate: "cubicOut",
    textStyle: { fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui", color: t.fg2, fontSize: 11 },
    grid: { left: 8, right: 12, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: t.fg, fontSize: 12 },
      extraCssText: "border-radius:10px;box-shadow:0 8px 24px -12px rgba(0,0,0,.35);font-variant-numeric:tabular-nums;",
      axisPointer: { type: "line", lineStyle: { color: t.axis, type: "dashed", width: 1 } },
    },
  };
}

export function axisStyle(t: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: t.grid } },
    axisTick: { show: false },
    axisLabel: { color: t.fg3, fontSize: 10, hideOverlap: true },
    splitLine: { lineStyle: { color: t.grid, type: [3, 3] as number[] } },
  };
}

/**
 * Thin ECharts wrapper: tree-shaken core + canvas renderer, one instance per
 * mount, incremental setOption on data changes, ResizeObserver, theme-aware.
 * `build` receives the resolved theme so colours follow light/dark switches.
 */
export function EChart({
  build,
  deps,
  className,
  ariaLabel,
  onClick,
}: {
  build: (t: ChartTheme) => EChartsOption;
  deps: unknown[];
  className?: string;
  ariaLabel: string;
  onClick?: (params: { name?: string; seriesName?: string; dataIndex?: number; value?: unknown }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const { resolvedTheme } = useTheme();
  const clickRef = useRef(onClick);
  useEffect(() => {
    clickRef.current = onClick;
  }, [onClick]);

  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chart.current = c;
    c.on("click", (p) => clickRef.current?.(p as never));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  // the caller controls recomputation through `deps` (cheap scalar keys, not the data arrays)
  const depKey = JSON.stringify(deps);
  const buildRef = useRef(build);
  useEffect(() => {
    buildRef.current = build;
  });
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    // merge by series index so streaming updates animate in place instead of re-creating series
    c.setOption(buildRef.current(readTheme()), { notMerge: false, lazyUpdate: true });
  }, [resolvedTheme, depKey]);

  return <div ref={ref} role="img" aria-label={ariaLabel} className={cn("h-full w-full", className)} />;
}
