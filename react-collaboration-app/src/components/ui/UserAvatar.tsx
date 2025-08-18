import React from 'react';
import { cn } from '@/lib/utils';
import { User } from '@/types';

export interface UserAvatarProps {
  user: User;
  size?: 'sm' | 'md' | 'lg';
  showStatus?: boolean;
  className?: string;
  onClick?: () => void;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  size = 'md',
  showStatus = true,
  className,
  onClick,
}) => {
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'w-6 h-6 text-xs';
      case 'md':
        return 'w-8 h-8 text-sm';
      case 'lg':
        return 'w-12 h-12 text-base';
      default:
        return 'w-8 h-8 text-sm';
    }
  };

  const getInitials = () => {
    return user.name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center rounded-full font-medium text-white cursor-pointer transition-transform hover:scale-105",
        getSizeClasses(),
        className
      )}
      style={{ backgroundColor: user.color }}
      onClick={onClick}
      title={user.name}
    >
      {user.avatar ? (
        <img
          src={user.avatar}
          alt={user.name}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        getInitials()
      )}
      
      {showStatus && (
        <div
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white",
            size === 'sm' ? 'w-2 h-2' : size === 'md' ? 'w-3 h-3' : 'w-4 h-4',
            user.isOnline ? 'bg-green-500' : 'bg-gray-400'
          )}
          aria-label={user.isOnline ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
};