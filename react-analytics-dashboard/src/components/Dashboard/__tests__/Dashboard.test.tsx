import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIInsights } from '../AIInsights';
import { ChartGrid } from '../ChartGrid';

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChartGrid', () => {
  it('renders the four analytics charts once data is loaded', async () => {
    renderWithQuery(<ChartGrid />);

    for (const title of ['Daily Visitors', 'Revenue Trend', 'Conversion Funnel', 'Traffic Sources']) {
      expect(await screen.findByRole('region', { name: title })).toBeInTheDocument();
    }
    expect(screen.getByRole('combobox')).toHaveValue('30');
  });
});

describe('AIInsights', () => {
  it('shows insights returned by the API with their source badge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          source: 'rules',
          highlights: ['Total Visitors is the strongest mover at +11.0% versus the previous period.'],
          generatedAt: '2026-10-17T12:00:00.000Z',
        })
      )
    );

    renderWithQuery(<AIInsights />);

    expect(await screen.findByText(/strongest mover/)).toBeInTheDocument();
    expect(screen.getByText('Rule-based')).toBeInTheDocument();
  });

  it('shows an error state when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    renderWithQuery(<AIInsights />);

    expect(await screen.findByText('Insights are unavailable right now.')).toBeInTheDocument();
  });
});
