'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dashboard } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import {
  ChartBarIcon,
  StarIcon,
  EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';

interface DashboardListProps {
  dashboards: Dashboard[];
}

export function DashboardList({ dashboards }: DashboardListProps) {
  const pathname = usePathname();

  const isActive = (dashboardId: string) => {
    return pathname === `/dashboard/${dashboardId}`;
  };

  if (dashboards.length === 0) {
    return (
      <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
        No dashboards yet
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {dashboards.map((dashboard) => (
        <div key={dashboard.id} className="group relative">
          <Link
            href={`/dashboard/${dashboard.id}`}
            className={`sidebar-item ${
              isActive(dashboard.id) ? 'sidebar-item-active' : 'sidebar-item-inactive'
            } pr-8`}
            title={dashboard.description || dashboard.name}
          >
            <ChartBarIcon className="w-4 h-4 flex-shrink-0" />
            <div className="ml-3 flex-1 min-w-0">
              <div className="truncate text-sm font-medium">
                {dashboard.name}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {formatDistanceToNow(new Date(dashboard.updatedAt), { addSuffix: true })}
              </div>
            </div>
          </Link>
          
          {/* Dashboard Actions */}
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="p-1 text-gray-400 rounded hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700"
              title="Dashboard options"
            >
              <EllipsisHorizontalIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}