'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  UserIcon,
  ChartBarIcon,
  DocumentIcon,
  CogIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { LoadingSpinner } from '@/components/UI/LoadingSpinner';

interface ActivityItem {
  id: string;
  type: 'user' | 'dashboard' | 'report' | 'settings' | 'view';
  title: string;
  description: string;
  timestamp: Date;
  user: {
    name: string;
    avatar?: string;
  };
}

// Mock data fetching function
async function fetchRecentActivity(): Promise<ActivityItem[]> {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 600));
  
  return [
    {
      id: '1',
      type: 'dashboard',
      title: 'Sales Dashboard Updated',
      description: 'Added new revenue metrics chart',
      timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      user: { name: 'John Doe' },
    },
    {
      id: '2',
      type: 'report',
      title: 'Monthly Report Generated',
      description: 'Q4 performance report created',
      timestamp: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      user: { name: 'Sarah Wilson' },
    },
    {
      id: '3',
      type: 'user',
      title: 'New User Registered',
      description: 'Alice Johnson joined the team',
      timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      user: { name: 'System' },
    },
    {
      id: '4',
      type: 'view',
      title: 'Dashboard Viewed',
      description: 'Analytics dashboard accessed',
      timestamp: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
      user: { name: 'Mike Chen' },
    },
    {
      id: '5',
      type: 'settings',
      title: 'Settings Updated',
      description: 'Notification preferences changed',
      timestamp: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      user: { name: 'Emma Brown' },
    },
    {
      id: '6',
      type: 'dashboard',
      title: 'Dashboard Created',
      description: 'New marketing dashboard created',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      user: { name: 'David Lee' },
    },
  ];
}

const activityIcons = {
  user: UserIcon,
  dashboard: ChartBarIcon,
  report: DocumentIcon,
  settings: CogIcon,
  view: EyeIcon,
};

const activityColors = {
  user: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  dashboard: 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400',
  report: 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
  settings: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  view: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400',
};

export function RecentActivity() {
  const { data: activities, isLoading, error } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: fetchRecentActivity,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Recent Activity
        </h3>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-start space-x-3 animate-pulse">
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Recent Activity
        </h3>
        <div className="text-center text-red-600 dark:text-red-400 py-8">
          Failed to load recent activity
        </div>
      </div>
    );
  }

  if (!activities) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Recent Activity
        </h3>
        <button className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">
          View all
        </button>
      </div>

      <div className="space-y-4">
        {activities.map((activity) => {
          const Icon = activityIcons[activity.type];
          const colorClass = activityColors[activity.type];

          return (
            <div key={activity.id} className="flex items-start space-x-3">
              <div className={`p-2 rounded-full ${colorClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {activity.title}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {activity.description}
                    </p>
                    <div className="flex items-center mt-2 text-xs text-gray-400 dark:text-gray-500">
                      <span>{activity.user.name}</span>
                      <span className="mx-1">•</span>
                      <span>
                        {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {activities.length === 0 && (
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          <ChartBarIcon className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p>No recent activity</p>
          <p className="text-sm mt-1">Activity will appear here as your team works</p>
        </div>
      )}
    </div>
  );
}