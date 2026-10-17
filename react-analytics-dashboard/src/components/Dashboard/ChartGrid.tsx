'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getChartSeries, type ChartSeries } from '@/lib/analytics/mockData';
import { formatCurrency, formatNumber } from '@/utils/helpers';

const RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
] as const;

async function fetchChartData(days: number): Promise<ChartSeries> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return getChartSeries(days);
}

const axisProps = {
  stroke: 'currentColor',
  tick: { fontSize: 12, fill: 'currentColor' },
  tickLine: false,
  axisLine: false,
} as const;

const tooltipStyle = {
  contentStyle: {
    borderRadius: 8,
    border: '1px solid rgb(229 231 235)',
    fontSize: 12,
  },
} as const;

const shortDate = (value: string) => value.slice(5);

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={title}
      className="rounded-lg border border-gray-200 bg-white p-6 transition-shadow hover:shadow-lg dark:border-gray-700 dark:bg-gray-800"
    >
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div className="h-64 text-gray-500 dark:text-gray-400">{children}</div>
    </section>
  );
}

export function ChartGrid() {
  const [days, setDays] = useState<number>(30);

  const { data, isLoading, error } = useQuery({
    queryKey: ['chart-data', days],
    queryFn: () => fetchChartData(days),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Analytics Charts</h2>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <span className="sr-only">Date range</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
          >
            {RANGES.map((range) => (
              <option key={range.days} value={range.days}>
                {range.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="p-8 text-center text-red-600 dark:text-red-400">Failed to load charts</div>
      ) : isLoading || !data ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="mb-4 h-6 w-32 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-64 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Daily Visitors">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.visitors}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} />
                <YAxis tickFormatter={(v: number) => formatNumber(v)} width={48} {...axisProps} />
                <Tooltip {...tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Visitors"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Revenue Trend">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.revenue}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} />
                <YAxis tickFormatter={(v: number) => formatNumber(v)} width={48} {...axisProps} />
                <Tooltip {...tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Revenue"
                  stroke="var(--color-chart-2)"
                  strokeWidth={2}
                  fill="url(#revenueFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Conversion Funnel">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.funnel} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => formatNumber(v)} {...axisProps} />
                <YAxis type="category" dataKey="stage" width={96} {...axisProps} />
                <Tooltip {...tooltipStyle} formatter={(v) => formatNumber(Number(v))} />
                <Bar dataKey="value" name="Users" fill="var(--color-chart-3)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Traffic Sources">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trafficSources}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} vertical={false} />
                <XAxis dataKey="source" {...axisProps} />
                <YAxis tickFormatter={(v: number) => formatNumber(v)} width={48} {...axisProps} />
                <Tooltip {...tooltipStyle} formatter={(v) => formatNumber(Number(v))} />
                <Bar
                  dataKey="visitors"
                  name="Visitors"
                  fill="var(--color-chart-4)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  );
}
