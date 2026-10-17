import type { Metric } from '@/types';

/**
 * Deterministic demo dataset. A seeded PRNG keeps server and client renders
 * identical (no hydration mismatch) and makes tests reproducible. Swap these
 * functions for real API calls when wiring the dashboard to a backend.
 */

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export interface FunnelStep {
  stage: string;
  value: number;
}

export interface ChartSeries {
  visitors: TimeSeriesPoint[];
  revenue: TimeSeriesPoint[];
  funnel: FunnelStep[];
  trafficSources: { source: string; visitors: number }[];
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSeries(
  seed: number,
  days: number,
  base: number,
  growthPerDay: number,
  noise: number,
  endDate: Date
): TimeSeriesPoint[] {
  const random = mulberry32(seed);
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(endDate);
    date.setUTCDate(endDate.getUTCDate() - (days - 1 - i));
    const weekly = Math.sin((i / 7) * 2 * Math.PI) * noise * 0.5;
    const jitter = (random() - 0.5) * noise;
    return {
      date: date.toISOString().slice(0, 10),
      value: Math.round(base + growthPerDay * i + weekly + jitter),
    };
  });
}

export function getChartSeries(days = 30, endDate = new Date('2026-10-15T00:00:00Z')): ChartSeries {
  return {
    visitors: buildSeries(42, days, 4200, 22, 600, endDate),
    revenue: buildSeries(7, days, 2600, 14, 420, endDate),
    funnel: [
      { stage: 'Visitors', value: 142_580 },
      { stage: 'Product views', value: 64_210 },
      { stage: 'Add to cart', value: 18_940 },
      { stage: 'Checkout', value: 8_120 },
      { stage: 'Purchase', value: 5_988 },
    ],
    trafficSources: [
      { source: 'Direct', visitors: 38_420 },
      { source: 'Organic search', visitors: 28_390 },
      { source: 'Social', visitors: 15_680 },
      { source: 'Email', visitors: 8_340 },
    ],
  };
}

export function getMetrics(): Metric[] {
  return [
    {
      id: 'total-visitors',
      name: 'Total Visitors',
      value: 142_580,
      previousValue: 128_430,
      format: 'number',
      trend: 'up',
      changePercent: 11.0,
      description: 'Unique visitors this month',
      category: 'Traffic',
      icon: 'users',
      color: '#3b82f6',
    },
    {
      id: 'page-views',
      name: 'Page Views',
      value: 425_670,
      previousValue: 398_250,
      format: 'number',
      trend: 'up',
      changePercent: 6.9,
      description: 'Total page views this month',
      category: 'Engagement',
      icon: 'eye',
      color: '#22c55e',
    },
    {
      id: 'revenue',
      name: 'Revenue',
      value: 87_420,
      previousValue: 82_350,
      unit: '$',
      format: 'currency',
      trend: 'up',
      changePercent: 6.2,
      description: 'Total revenue this month',
      category: 'Sales',
      icon: 'currency',
      color: '#f59e0b',
    },
    {
      id: 'conversion-rate',
      name: 'Conversion Rate',
      value: 4.2,
      previousValue: 3.8,
      unit: '%',
      format: 'percentage',
      trend: 'up',
      changePercent: 10.5,
      description: 'Visitor-to-purchase conversion this month',
      category: 'Performance',
      icon: 'chart',
      color: '#8b5cf6',
    },
  ];
}
