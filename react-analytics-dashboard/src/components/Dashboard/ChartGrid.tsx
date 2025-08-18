'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ChartData } from '@/types';
import { LoadingSpinner } from '@/components/UI/LoadingSpinner';

// Mock data fetching function
async function fetchChartData() {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 1200));
  
  const generateTimeSeriesData = (name: string, points: number = 30) => {
    const data = [];
    const now = new Date();
    
    for (let i = points - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      data.push({
        id: `${name}-${i}`,
        timestamp: date,
        value: Math.floor(Math.random() * 1000) + 500,
        label: date.toISOString().split('T')[0],
      });
    }
    
    return data;
  };

  return [
    {
      id: 'visitors-chart',
      title: 'Daily Visitors',
      type: 'line' as const,
      data: [
        {
          id: 'visitors',
          name: 'Visitors',
          data: generateTimeSeriesData('visitors'),
          color: '#3b82f6',
          type: 'line' as const,
        },
      ],
      config: {
        responsive: true,
        maintainAspectRatio: false,
        animation: true,
        legend: { display: true, position: 'top' as const },
        tooltip: { enabled: true, mode: 'single' as const },
      },
      lastUpdated: new Date(),
    },
    {
      id: 'revenue-chart',
      title: 'Revenue Trend',
      type: 'area' as const,
      data: [
        {
          id: 'revenue',
          name: 'Revenue',
          data: generateTimeSeriesData('revenue'),
          color: '#22c55e',
          type: 'area' as const,
        },
      ],
      config: {
        responsive: true,
        maintainAspectRatio: false,
        animation: true,
        legend: { display: true, position: 'top' as const },
        tooltip: { enabled: true, mode: 'single' as const },
      },
      lastUpdated: new Date(),
    },
    {
      id: 'conversions-chart',
      title: 'Conversion Funnel',
      type: 'bar' as const,
      data: [
        {
          id: 'conversions',
          name: 'Conversions',
          data: [
            { id: '1', timestamp: new Date(), value: 1000, label: 'Visitors' },
            { id: '2', timestamp: new Date(), value: 750, label: 'Product Views' },
            { id: '3', timestamp: new Date(), value: 500, label: 'Add to Cart' },
            { id: '4', timestamp: new Date(), value: 250, label: 'Checkout' },
            { id: '5', timestamp: new Date(), value: 120, label: 'Purchase' },
          ],
          color: '#f59e0b',
          type: 'bar' as const,
        },
      ],
      config: {
        responsive: true,
        maintainAspectRatio: false,
        animation: true,
        legend: { display: false, position: 'top' as const },
        tooltip: { enabled: true, mode: 'single' as const },
      },
      lastUpdated: new Date(),
    },
  ] as ChartData[];
}

export function ChartGrid() {
  const [selectedChart, setSelectedChart] = useState<string | null>(null);
  
  const { data: charts, isLoading, error } = useQuery({
    queryKey: ['chart-data'],
    queryFn: fetchChartData,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 animate-pulse"
          >
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded mb-4 w-32" />
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 dark:text-red-400 p-8">
        Failed to load charts
      </div>
    );
  }

  if (!charts) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Analytics Charts
        </h2>
        <div className="flex items-center space-x-2">
          <select className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            <option>Last 30 days</option>
            <option>Last 7 days</option>
            <option>Last 90 days</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {charts.map((chart) => (
          <div
            key={chart.id}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {chart.title}
              </h3>
              <button
                onClick={() => setSelectedChart(chart.id)}
                className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
              >
                View details
              </button>
            </div>

            {/* Chart placeholder - will be replaced with actual chart components */}
            <div className="h-64 bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 rounded-lg flex items-center justify-center border-2 border-dashed border-primary-200 dark:border-primary-700">
              <div className="text-center">
                <div className="text-primary-600 dark:text-primary-400 mb-2">
                  📊
                </div>
                <p className="text-sm text-primary-600 dark:text-primary-400 font-medium">
                  {chart.title}
                </p>
                <p className="text-xs text-primary-500 dark:text-primary-500 mt-1">
                  {chart.type.charAt(0).toUpperCase() + chart.type.slice(1)} Chart
                </p>
              </div>
            </div>

            {/* Chart metadata */}
            <div className="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>
                {chart.data.length} series
              </span>
              <span>
                Updated {chart.lastUpdated.toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Add new chart button */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-8 text-center hover:border-primary-400 dark:hover:border-primary-500 transition-colors cursor-pointer">
        <div className="text-gray-400 dark:text-gray-500 mb-2">
          ➕
        </div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
          Add New Chart
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
          Create custom visualizations for your data
        </p>
      </div>
    </div>
  );
}