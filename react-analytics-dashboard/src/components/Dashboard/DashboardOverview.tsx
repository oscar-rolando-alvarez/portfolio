'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  CalendarIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';
import { DateRange } from '@/types';
import { LoadingSpinner } from '@/components/UI/LoadingSpinner';

interface DashboardOverviewProps {
  className?: string;
}

// Mock data fetching function
async function fetchDashboardOverview(dateRange: DateRange) {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    totalVisitors: 142580,
    totalPageViews: 425670,
    bounceRate: 32.4,
    avgSessionDuration: 235, // seconds
    conversionRate: 4.2,
    revenue: 87420,
    lastUpdated: new Date(),
    topPages: [
      { path: '/dashboard', views: 45230, change: 12.5 },
      { path: '/analytics', views: 32180, change: -3.2 },
      { path: '/reports', views: 28950, change: 8.7 },
    ],
    topSources: [
      { source: 'Direct', visitors: 38420, percentage: 42.3 },
      { source: 'Google', visitors: 28390, percentage: 31.2 },
      { source: 'Social Media', visitors: 15680, percentage: 17.2 },
      { source: 'Email', visitors: 8340, percentage: 9.3 },
    ],
  };
}

export function DashboardOverview({ className }: DashboardOverviewProps) {
  const [dateRange] = useState<DateRange>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    end: new Date(),
    preset: 'last30days',
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-overview', dateRange],
    queryFn: () => fetchDashboardOverview(dateRange),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 dark:text-red-400 p-8">
        Failed to load dashboard overview
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Performance Overview
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Last updated {formatDistanceToNow(data.lastUpdated, { addSuffix: true })}
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <CalendarIcon className="w-4 h-4 mr-2" />
            Last 30 days
          </button>
          
          <button className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <FunnelIcon className="w-4 h-4 mr-2" />
            Filters
          </button>
          
          <button className="inline-flex items-center px-3 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700 transition-colors">
            <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Pages */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Top Pages
          </h3>
          <div className="space-y-4">
            {data.topPages.map((page, index) => (
              <div key={page.path} className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-8">
                    #{index + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {page.path}
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {page.views.toLocaleString()} views
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      page.change >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {page.change >= 0 ? '+' : ''}{page.change}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Traffic Sources */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Traffic Sources
          </h3>
          <div className="space-y-4">
            {data.topSources.map((source) => (
              <div key={source.source} className="flex items-center justify-between">
                <div className="flex items-center">
                  <div
                    className="w-3 h-3 rounded-full mr-3"
                    style={{
                      backgroundColor: {
                        'Direct': '#3b82f6',
                        'Google': '#ef4444',
                        'Social Media': '#22c55e',
                        'Email': '#f59e0b',
                      }[source.source] || '#6b7280'
                    }}
                  />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {source.source}
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {source.visitors.toLocaleString()}
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {source.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}