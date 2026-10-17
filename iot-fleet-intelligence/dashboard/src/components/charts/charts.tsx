"use client";

import { useLocale } from "next-intl";
import { formatCompact, formatNumber, formatPercent, formatTime } from "@/lib/format";
import type { TimelineMarker } from "@/lib/stream/reducer";
import type { Histogram, Point } from "@/lib/stream/types";
import { alpha, axisStyle, baseOption, EChart, type ChartTheme } from "./echart";

const timeAxis = (t: ChartTheme, locale: string) => ({
  type: "time" as const,
  ...axisStyle(t),
  splitLine: { show: false },
  axisLabel: { color: t.fg3, fontSize: 10, hideOverlap: true, formatter: (v: number) => formatTime(locale, v, false) },
});

/** Events/s as an area line; live anomaly onsets as dashed verticals. */
export function ThroughputChart({
  points,
  markers = [],
  ariaLabel,
  seriesName,
  height = 260,
}: {
  points: Point[];
  markers?: TimelineMarker[];
  ariaLabel: string;
  seriesName: string;
  height?: number;
}) {
  const locale = useLocale();
  const last = points.at(-1)?.ts ?? 0;
  return (
    <div style={{ height }}>
      <EChart
        ariaLabel={ariaLabel}
        deps={[last, points.length, markers.length, locale]}
        build={(t) => ({
          ...baseOption(t),
          xAxis: timeAxis(t, locale),
          yAxis: {
            type: "value",
            scale: true,
            ...axisStyle(t),
            axisLabel: { color: t.fg3, fontSize: 10, formatter: (v: number) => formatCompact(locale, v) },
          },
          tooltip: {
            ...(baseOption(t).tooltip as object),
            valueFormatter: (v: number) => `${formatNumber(locale, v)} /s`,
          },
          series: [
            {
              name: seriesName,
              type: "line",
              showSymbol: false,
              smooth: 0.25,
              sampling: "lttb",
              lineStyle: { width: 2, color: t.series[0] },
              itemStyle: { color: t.series[0] },
              areaStyle: {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: alpha(t.series[0], 0.3) },
                    { offset: 1, color: "transparent" },
                  ],
                },
              },
              data: points.map((p) => [p.ts, p.eventsPerSec]),
              markLine: {
                silent: true,
                symbol: "none",
                animation: false,
                lineStyle: { color: t.serious, type: "dashed", width: 1 },
                label: { show: false },
                data: markers.filter((m) => m.type === "anomaly" && m.ts >= (points[0]?.ts ?? 0)).map((m) => ({ xAxis: m.ts })),
              },
            },
          ],
        })}
      />
    </div>
  );
}

export function HistogramChart({
  hist,
  unit,
  ariaLabel,
  color = 0,
  height = 200,
}: {
  hist: Histogram | undefined;
  unit: string;
  ariaLabel: string;
  color?: number;
  height?: number;
}) {
  const locale = useLocale();
  const counts = hist?.counts ?? [];
  const total = counts.reduce((s, x) => s + x, 0) || 1;
  const labels = (hist?.edges ?? []).slice(0, -1).map((e) => String(e));
  return (
    <div style={{ height }}>
      <EChart
        ariaLabel={ariaLabel}
        deps={[counts.join(","), locale]}
        build={(t) => ({
          ...baseOption(t),
          tooltip: {
            ...(baseOption(t).tooltip as object),
            trigger: "axis",
            axisPointer: { type: "shadow" },
            formatter: (ps: { dataIndex: number; value: number }[]) => {
              const p = ps[0]!;
              const lo = hist!.edges[p.dataIndex]!;
              const hi = hist!.edges[p.dataIndex + 1]!;
              return `${lo}…${hi} ${unit}<br/><b>${formatPercent(locale, p.value / total)}</b>`;
            },
          },
          xAxis: {
            type: "category",
            data: labels,
            ...axisStyle(t),
            splitLine: { show: false },
            axisLabel: { color: t.fg3, fontSize: 10, interval: 3 },
          },
          yAxis: { type: "value", ...axisStyle(t), axisLabel: { show: false } },
          series: [
            {
              type: "bar",
              barCategoryGap: "18%",
              itemStyle: { color: t.series[color], borderRadius: [3, 3, 0, 0] },
              data: counts,
            },
          ],
        })}
      />
    </div>
  );
}

/** Fleet anomaly score (0..1) with live-signal and confirmed-incident markers. */
export function AnomalyTimeline({
  points,
  markers,
  labels,
  height = 220,
}: {
  points: Point[];
  markers: TimelineMarker[];
  labels: { score: string; signal: string; incident: string; aria: string; fault: (k: string) => string };
  height?: number;
}) {
  const locale = useLocale();
  const from = points[0]?.ts ?? 0;
  const visible = markers.filter((m) => m.ts >= from);
  const last = points.at(-1)?.ts ?? 0;
  return (
    <div style={{ height }}>
      <EChart
        ariaLabel={labels.aria}
        deps={[last, visible.length, locale]}
        build={(t) => ({
          ...baseOption(t),
          legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: t.fg2, fontSize: 11 }, icon: "circle" },
          grid: { left: 8, right: 12, top: 28, bottom: 4, containLabel: true },
          xAxis: timeAxis(t, locale),
          yAxis: {
            type: "value",
            min: 0,
            max: 1,
            ...axisStyle(t),
            axisLabel: { color: t.fg3, fontSize: 10, formatter: (v: number) => formatPercent(locale, v, 0) },
          },
          tooltip: { ...(baseOption(t).tooltip as object), trigger: "item" },
          series: [
            {
              name: labels.score,
              type: "line",
              showSymbol: false,
              step: "end",
              lineStyle: { width: 1.5, color: t.serious },
              itemStyle: { color: t.serious },
              areaStyle: { color: alpha(t.serious, 0.16) },
              data: points.map((p) => [p.ts, p.anomalyScore]),
              markArea: {
                silent: true,
                itemStyle: { color: alpha(t.critical, 0.035) },
                data: [[{ yAxis: 0.3 }, { yAxis: 1 }]],
              },
              tooltip: { show: false },
            },
            {
              name: labels.signal,
              type: "scatter",
              symbol: "triangle",
              symbolSize: 11,
              itemStyle: { color: t.warning, borderColor: t.surface, borderWidth: 2 },
              data: visible
                .filter((m) => m.type === "anomaly")
                .map((m) => ({ value: [m.ts, Math.min(0.98, m.score ?? 0.6)], name: `${labels.fault(m.kind)} · ${m.scope}` })),
              tooltip: {
                formatter: (p: { name: string; value: [number, number] }) =>
                  `${labels.signal}<br/><b>${p.name}</b><br/>${formatTime(locale, p.value[0])}`,
              },
            },
            {
              name: labels.incident,
              type: "scatter",
              symbol: "diamond",
              symbolSize: 13,
              itemStyle: { color: t.critical, borderColor: t.surface, borderWidth: 2 },
              data: visible
                .filter((m) => m.type === "incident")
                .map((m) => ({ value: [m.ts, 0.08], name: `${labels.fault(m.kind)} · ${m.scope}` })),
              tooltip: {
                formatter: (p: { name: string; value: [number, number] }) =>
                  `${labels.incident}<br/><b>${p.name}</b><br/>${formatTime(locale, p.value[0])}`,
              },
            },
          ],
        })}
      />
    </div>
  );
}

export function HorizontalBars({
  rows,
  ariaLabel,
  format,
  height,
  colorIndex = 0,
}: {
  rows: { label: string; value: number }[];
  ariaLabel: string;
  format: (v: number) => string;
  height?: number;
  colorIndex?: number;
}) {
  const h = height ?? Math.max(120, rows.length * 30 + 20);
  return (
    <div style={{ height: h }}>
      <EChart
        ariaLabel={ariaLabel}
        deps={[rows.map((r) => `${r.label}:${r.value.toFixed(2)}`).join("|")]}
        build={(t) => ({
          ...baseOption(t),
          grid: { left: 4, right: 64, top: 4, bottom: 4, containLabel: true },
          tooltip: {
            ...(baseOption(t).tooltip as object),
            trigger: "axis",
            axisPointer: { type: "shadow" },
            valueFormatter: (v: number) => format(v),
          },
          xAxis: { type: "value", show: false },
          yAxis: {
            type: "category",
            inverse: true,
            data: rows.map((r) => r.label),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: t.fg2, fontSize: 11 },
          },
          series: [
            {
              type: "bar",
              barWidth: 14,
              itemStyle: { color: t.series[colorIndex], borderRadius: [0, 4, 4, 0] },
              label: { show: true, position: "right", color: t.fg2, fontSize: 11, formatter: (p: { value: number }) => format(p.value) },
              data: rows.map((r) => r.value),
            },
          ],
        })}
      />
    </div>
  );
}

export function ScaleCurve({
  points,
  current,
  ariaLabel,
  formatX,
  formatY,
  height = 240,
}: {
  points: [number, number][];
  current: [number, number];
  ariaLabel: string;
  formatX: (v: number) => string;
  formatY: (v: number) => string;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <EChart
        ariaLabel={ariaLabel}
        deps={[current[0], current[1], points.length, points[0]?.[1]]}
        build={(t) => ({
          ...baseOption(t),
          tooltip: {
            ...(baseOption(t).tooltip as object),
            trigger: "axis",
            formatter: (ps: { value: [number, number] }[]) => `${formatX(ps[0]!.value[0])}<br/><b>${formatY(ps[0]!.value[1])}</b>`,
          },
          xAxis: {
            type: "log",
            min: 10_000,
            max: 10_000_000,
            ...axisStyle(t),
            splitLine: { show: false },
            axisLabel: { color: t.fg3, fontSize: 10, formatter: formatX },
          },
          yAxis: { type: "value", ...axisStyle(t), axisLabel: { color: t.fg3, fontSize: 10, formatter: formatY } },
          series: [
            {
              type: "line",
              showSymbol: false,
              smooth: true,
              lineStyle: { width: 2, color: t.series[0] },
              data: points,
              markPoint: undefined,
            },
            {
              type: "scatter",
              symbolSize: 12,
              itemStyle: { color: t.series[1], borderColor: t.surface, borderWidth: 2 },
              data: [current],
              z: 3,
            },
          ],
        })}
      />
    </div>
  );
}
