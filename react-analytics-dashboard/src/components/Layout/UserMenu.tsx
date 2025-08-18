'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  UserIcon,
  CogIcon,
  QuestionMarkCircleIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useUserStore } from '@/store/userStore';

interface UserMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserMenu({ isOpen, onClose }: UserMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useUserStore();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleLogout = () => {
    logout();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
    >
      {/* User Info */}
      {user && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            {user.avatar ? (
              <img
                className="w-10 h-10 rounded-full"
                src={user.avatar}
                alt={user.name}
              />
            ) : (
              <div className="w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                <UserIcon className="w-6 h-6 text-gray-600 dark:text-gray-300" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user.name}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {user.email}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 capitalize">
                {user.role}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Menu Items */}
      <div className="py-1">
        <Link
          href="/profile"
          onClick={onClose}
          className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <UserIcon className="w-5 h-5 mr-3" />
          Your Profile
        </Link>
        
        <Link
          href="/settings"
          onClick={onClose}
          className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <CogIcon className="w-5 h-5 mr-3" />
          Settings
        </Link>
        
        <Link
          href="/help"
          onClick={onClose}
          className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <QuestionMarkCircleIcon className="w-5 h-5 mr-3" />
          Help & Support
        </Link>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleLogout}
          className="flex w-full items-center px-4 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <ArrowRightOnRectangleIcon className="w-5 h-5 mr-3" />
          Sign out
        </button>
      </div>
    </div>
  );
}