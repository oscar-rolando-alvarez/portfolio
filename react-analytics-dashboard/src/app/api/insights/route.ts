import { NextResponse } from 'next/server';
import { getChartSeries, getMetrics } from '@/lib/analytics/mockData';
import { generateInsights } from '@/lib/insights/insights';
import { resolveInsightsModel } from '@/lib/insights/provider';

// Evaluated per request so runtime env vars (AI_*) are honoured in containers.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const result = await generateInsights(
    { metrics: getMetrics(), funnel: getChartSeries().funnel },
    { model: resolveInsightsModel(), abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]) }
  );
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
