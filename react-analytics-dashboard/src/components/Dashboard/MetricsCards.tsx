'use client';

import { useQuery } from '@tanstack/react-query';
import {
  UsersIcon,
  EyeIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from '@heroicons/react/24/outline';
import { Metric } from '@/types';
import { formatCurrency, formatNumber, formatPercentage } from '@/utils/helpers';
import { LoadingSpinner } from '@/components/UI/LoadingSpinner';

// Mock data fetching function
async function fetchMetrics() {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 800));
  
  return [
    {
      id: 'total-visitors',
      name: 'Total Visitors',
      value: 142580,
      previousValue: 128430,
      unit: '',
      format: 'number',
      trend: 'up' as const,
      changePercent: 11.0,
      description: 'Unique visitors this month',
      category: 'Traffic',
      icon: 'users',
      color: '#3b82f6',
    },
    {
      id: 'page-views',
      name: 'Page Views',
      value: 425670,
      previousValue: 398250,
      unit: '',
      format: 'number',
      trend: 'up' as const,
      changePercent: 6.9,
      description: 'Total page views this month',
      category: 'Engagement',
      icon: 'eye',
      color: '#22c55e',
    },
    {
      id: 'revenue',
      name: 'Revenue',
      value: 87420,
      previousValue: 82350,
      unit: '$',
      format: 'currency',
      trend: 'up' as const,
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
      trend: 'up' as const,
      changePercent: 10.5,
      description: 'Conversion rate this month',
      category: 'Performance',
      icon: 'chart',
      color: '#8b5cf6',
    },
  ] as Metric[];
}

const iconMap = {
  users: UsersIcon,
  eye: EyeIcon,
  currency: CurrencyDollarIcon,
  chart: ChartBarIcon,
};

export function MetricsCards() {
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 animate-pulse"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
              <div className="w-16 h-6 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
            <div className="space-y-2">
              <div className="w-20 h-8 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="w-32 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 dark:text-red-400 p-8">
        Failed to load metrics
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {metrics.map((metric) => {
        const Icon = iconMap[metric.icon as keyof typeof iconMap] || ChartBarIcon;
        const TrendIcon = metric.trend === 'up' ? ArrowUpIcon : ArrowDownIcon;
        
        const formatValue = (value: number) => {
          switch (metric.format) {
            case 'currency':
              return formatCurrency(value);
            case 'percentage':
              return formatPercentage(value);
            case 'number':
            default:
              return formatNumber(value);
          }
        };

        return (
          <div
            key={metric.id}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${metric.color}20` }}
              >
                <Icon
                  className="w-6 h-6"
                  style={{ color: metric.color }}
                />
              </div>
              
              <div
                className={`flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  metric.trend === 'up'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                    : metric.trend === 'down'
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                <TrendIcon className="w-3 h-3 mr-1" />
                {formatPercentage(metric.changePercent || 0, 1)}
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatValue(metric.value)}
              </h3>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {metric.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                {metric.description}
              </p>
            </div>

            {/* Previous Value Comparison */}
            {metric.previousValue && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">
                    Previous period
                  </span>
                  <span className="text-gray-600 dark:text-gray-300 font-medium">
                    {formatValue(metric.previousValue)}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}