'use client';

import { cn } from '@/utils/helpers';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  color?: 'primary' | 'secondary' | 'white';
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

const colorMap = {
  primary: 'border-primary-600 border-t-transparent',
  secondary: 'border-gray-300 border-t-transparent dark:border-gray-600',
  white: 'border-white border-t-transparent',
};

export function LoadingSpinner({ 
  size = 'md', 
  className,
  color = 'primary' 
}: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center" role="status" aria-label="Loading">
      <div
        className={cn(
          'animate-spin rounded-full border-2',
          sizeMap[size],
          colorMap[color],
          className
        )}
      />
      <span className="sr-only">Loading...</span>
    </div>
  );
}