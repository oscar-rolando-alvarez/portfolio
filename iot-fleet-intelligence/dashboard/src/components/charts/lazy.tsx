"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/primitives";

/**
 * Charts are code-split: the ECharts engine (~200 KB gzip) loads after first
 * paint, so KPIs and tables are interactive immediately (see the bundle budget).
 */
const loading = () => <Skeleton className="h-full min-h-48 w-full" />;

export const ThroughputChart = dynamic(() => import("./charts").then((m) => m.ThroughputChart), { ssr: false, loading });
export const HistogramChart = dynamic(() => import("./charts").then((m) => m.HistogramChart), { ssr: false, loading });
export const AnomalyTimeline = dynamic(() => import("./charts").then((m) => m.AnomalyTimeline), { ssr: false, loading });
export const HorizontalBars = dynamic(() => import("./charts").then((m) => m.HorizontalBars), { ssr: false, loading });
export const ScaleCurve = dynamic(() => import("./charts").then((m) => m.ScaleCurve), { ssr: false, loading });
