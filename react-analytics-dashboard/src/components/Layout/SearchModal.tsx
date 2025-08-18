'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  MagnifyingGlassIcon,
  ClockIcon,
  ChartBarIcon,
  DocumentIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useDashboardStore } from '@/store/dashboardStore';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchResult {
  id: string;
  title: string;
  type: 'dashboard' | 'chart' | 'report' | 'user';
  description?: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

const recentSearches = [
  'Sales dashboard',
  'User analytics',
  'Revenue reports',
  'Performance metrics',
];

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { dashboards } = useDashboardStore();

  useEffect(() => {
    if (isOpen) {
      // Focus input when modal opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      // Reset state when modal closes
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    // Search through dashboards
    const dashboardResults: SearchResult[] = dashboards
      .filter(dashboard =>
        dashboard.name.toLowerCase().includes(query.toLowerCase()) ||
        dashboard.description?.toLowerCase().includes(query.toLowerCase())
      )
      .map(dashboard => ({
        id: dashboard.id,
        title: dashboard.name,
        type: 'dashboard' as const,
        description: dashboard.description,
        url: `/dashboard/${dashboard.id}`,
        icon: ChartBarIcon,
      }));

    // Mock additional search results
    const mockResults: SearchResult[] = [
      {
        id: 'reports-1',
        title: 'Monthly Revenue Report',
        type: 'report',
        description: 'Comprehensive monthly revenue analysis',
        url: '/reports/monthly-revenue',
        icon: DocumentIcon,
      },
      {
        id: 'users-1',
        title: 'Marketing Team',
        type: 'user',
        description: 'Team dashboard and analytics',
        url: '/team/marketing',
        icon: UserGroupIcon,
      },
    ].filter(item =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.description?.toLowerCase().includes(query.toLowerCase())
    );

    setResults([...dashboardResults, ...mockResults]);
    setSelectedIndex(0);
  }, [query, dashboards]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          router.push(results[selectedIndex].url);
          onClose();
        }
        break;
      case 'Escape':
        onClose();
        break;
    }
  };

  const handleResultClick = (result: SearchResult) => {
    router.push(result.url);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-start justify-center p-4 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative inline-block w-full max-w-2xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-lg">
          {/* Search Input */}
          <div className="flex items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 mr-3" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search dashboards, reports, and more..."
              className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Search Results */}
          <div className="max-h-96 overflow-y-auto">
            {query && results.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                No results found for "{query}"
              </div>
            )}

            {query && results.length > 0 && (
              <div className="py-2">
                <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Search Results
                </div>
                {results.map((result, index) => (
                  <button
                    key={result.id}
                    onClick={() => handleResultClick(result)}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      index === selectedIndex ? 'bg-gray-50 dark:bg-gray-700' : ''
                    }`}
                  >
                    <div className="flex items-center">
                      <result.icon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {result.title}
                        </div>
                        {result.description && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                            {result.description}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 ml-3 capitalize">
                        {result.type}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!query && (
              <div className="py-2">
                <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Recent Searches
                </div>
                {recentSearches.map((search, index) => (
                  <button
                    key={search}
                    onClick={() => setQuery(search)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center">
                      <ClockIcon className="w-5 h-5 text-gray-400 mr-3" />
                      <div className="text-sm text-gray-900 dark:text-white">
                        {search}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center space-x-4">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
                <span>esc Close</span>
              </div>
              <span>Powered by Search API</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}