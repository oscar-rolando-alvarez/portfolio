'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bars3Icon,
  BellIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';
import { useThemeStore } from '@/store/themeStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useUserStore } from '@/store/userStore';
import { SearchModal } from './SearchModal';
import { NotificationPanel } from './NotificationPanel';
import { UserMenu } from './UserMenu';

export function Navigation() {
  const router = useRouter();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  
  const { theme, toggleTheme } = useThemeStore();
  const { unreadCount } = useNotificationStore();
  const { user, isAuthenticated } = useUserStore();

  const themeIcon = {
    light: SunIcon,
    dark: MoonIcon,
    auto: ComputerDesktopIcon,
  }[theme];

  const ThemeIcon = themeIcon;

  return (
    <>
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 fixed w-full z-30 top-0">
        <div className="px-3 py-3 lg:px-5 lg:pl-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-start">
              <button
                type="button"
                className="inline-flex items-center p-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600 lg:hidden"
                aria-controls="sidebar"
                aria-expanded="true"
              >
                <span className="sr-only">Open sidebar</span>
                <Bars3Icon className="w-6 h-6" />
              </button>
              
              <Link href="/" className="flex ml-2 md:mr-24">
                <span className="self-center text-xl font-semibold sm:text-2xl whitespace-nowrap dark:text-white">
                  Analytics Dashboard
                </span>
              </Link>
            </div>
            
            <div className="flex items-center">
              <div className="flex items-center ml-3 space-x-3">
                {/* Search */}
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  className="p-2 text-gray-500 rounded-lg hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600"
                >
                  <span className="sr-only">Search</span>
                  <MagnifyingGlassIcon className="w-5 h-5" />
                </button>

                {/* Theme Toggle */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="p-2 text-gray-500 rounded-lg hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600"
                  title={`Current theme: ${theme}`}
                >
                  <span className="sr-only">Toggle theme</span>
                  <ThemeIcon className="w-5 h-5" />
                </button>

                {/* Notifications */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                    className="p-2 text-gray-500 rounded-lg hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600"
                  >
                    <span className="sr-only">View notifications</span>
                    <BellIcon className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <div className="absolute inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 border-2 border-white rounded-full -top-1 -right-1 dark:border-gray-900">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </div>
                    )}
                  </button>
                  
                  <NotificationPanel
                    isOpen={isNotificationsOpen}
                    onClose={() => setIsNotificationsOpen(false)}
                  />
                </div>

                {/* User Menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex text-sm bg-gray-800 rounded-full focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600"
                  >
                    <span className="sr-only">Open user menu</span>
                    {user?.avatar ? (
                      <img
                        className="w-8 h-8 rounded-full"
                        src={user.avatar}
                        alt={user.name}
                      />
                    ) : (
                      <UserCircleIcon className="w-8 h-8 text-gray-400" />
                    )}
                  </button>
                  
                  <UserMenu
                    isOpen={isUserMenuOpen}
                    onClose={() => setIsUserMenuOpen(false)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
}