import { Suspense } from 'react';
import { DashboardOverview } from '@/components/Dashboard/DashboardOverview';
import { MetricsCards } from '@/components/Dashboard/MetricsCards';
import { ChartGrid } from '@/components/Dashboard/ChartGrid';
import { RecentActivity } from '@/components/Dashboard/RecentActivity';
import { LoadingSpinner } from '@/components/UI/LoadingSpinner';
import { ErrorBoundary } from '@/components/Error/ErrorBoundary';

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Dashboard Overview
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Real-time analytics and insights for your business
          </p>
        </div>
      </div>

      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner size="lg" />}>
          <MetricsCards />
        </Suspense>
      </ErrorBoundary>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner size="lg" />}>
              <ChartGrid />
            </Suspense>
          </ErrorBoundary>
        </div>
        
        <div className="lg:col-span-1">
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner size="lg" />}>
              <RecentActivity />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>

      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner size="lg" />}>
          <DashboardOverview />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}