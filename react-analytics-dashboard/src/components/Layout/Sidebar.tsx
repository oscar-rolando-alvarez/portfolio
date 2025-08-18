'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HomeIcon,
  ChartBarIcon,
  TableCellsIcon,
  CogIcon,
  PlusIcon,
  FolderIcon,
  BookmarkIcon,
  ClockIcon,
  UserGroupIcon,
  DocumentChartBarIcon,
} from '@heroicons/react/24/outline';
import { useDashboardStore } from '@/store/dashboardStore';
import { DashboardList } from './DashboardList';

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Data Tables', href: '/tables', icon: TableCellsIcon },
  { name: 'Reports', href: '/reports', icon: DocumentChartBarIcon },
  { name: 'Team', href: '/team', icon: UserGroupIcon },
];

const quickAccess = [
  { name: 'Recent', href: '/recent', icon: ClockIcon },
  { name: 'Bookmarks', href: '/bookmarks', icon: BookmarkIcon },
  { name: 'Templates', href: '/templates', icon: FolderIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { dashboards } = useDashboardStore();

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`fixed top-0 left-0 z-20 flex flex-col flex-shrink-0 pt-16 duration-300 transition-all bg-white border-r border-gray-200 dark:bg-gray-800 dark:border-gray-700 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Collapse Button */}
        <div className="flex items-center justify-end p-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 text-gray-500 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${
                isCollapsed ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </div>

        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Main Navigation */}
          <nav className="flex-1 px-3 pb-4 space-y-1">
            <div className={`${isCollapsed ? 'hidden' : 'block'} mb-4`}>
              <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Main
              </p>
            </div>
            
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`sidebar-item ${
                    isActive(item.href) ? 'sidebar-item-active' : 'sidebar-item-inactive'
                  }`}
                  title={isCollapsed ? item.name : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && (
                    <span className="ml-3 truncate">{item.name}</span>
                  )}
                </Link>
              );
            })}

            {/* Quick Access */}
            <div className={`${isCollapsed ? 'hidden' : 'block'} mt-8 mb-4`}>
              <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Quick Access
              </p>
            </div>
            
            {quickAccess.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`sidebar-item ${
                    isActive(item.href) ? 'sidebar-item-active' : 'sidebar-item-inactive'
                  }`}
                  title={isCollapsed ? item.name : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && (
                    <span className="ml-3 truncate">{item.name}</span>
                  )}
                </Link>
              );
            })}

            {/* Dashboards Section */}
            {!isCollapsed && (
              <>
                <div className="mt-8 mb-4">
                  <div className="flex items-center justify-between px-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Dashboards
                    </p>
                    <Link
                      href="/dashboard/new"
                      className="p-1 text-gray-400 rounded hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700"
                      title="Create new dashboard"
                    >
                      <PlusIcon className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
                
                <DashboardList dashboards={dashboards.slice(0, 5)} />
                
                {dashboards.length > 5 && (
                  <Link
                    href="/dashboards"
                    className="sidebar-item sidebar-item-inactive text-xs"
                  >
                    <span className="ml-3">View all ({dashboards.length})</span>
                  </Link>
                )}
              </>
            )}
          </nav>

          {/* Settings at bottom */}
          <div className="px-3 pb-4">
            <Link
              href="/settings"
              className={`sidebar-item ${
                isActive('/settings') ? 'sidebar-item-active' : 'sidebar-item-inactive'
              }`}
              title={isCollapsed ? 'Settings' : undefined}
            >
              <CogIcon className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && (
                <span className="ml-3 truncate">Settings</span>
              )}
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}