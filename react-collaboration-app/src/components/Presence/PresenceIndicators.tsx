import React from 'react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { cn } from '@/lib/utils';

export const PresenceIndicators: React.FC = () => {
  const { users, currentUser } = useCollaborationStore();

  const onlineUsers = users.filter(user => 
    user.isOnline && user.id !== currentUser?.id
  );

  if (onlineUsers.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-40 flex items-center gap-2 bg-white rounded-lg shadow-md border border-gray-200 p-2">
      <span className="text-sm text-gray-600 mr-2">Online:</span>
      <div className="flex -space-x-2">
        {onlineUsers.slice(0, 5).map((user, index) => (
          <div
            key={user.id}
            className={cn(
              "relative transition-transform hover:scale-110 hover:z-10",
              index > 0 && "ml-2"
            )}
            style={{ zIndex: onlineUsers.length - index }}
          >
            <UserAvatar
              user={user}
              size="sm"
              showStatus={false}
              className="border-2 border-white shadow-sm"
            />
            
            {/* Activity indicator */}
            {user.cursor && (
              <div 
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white animate-pulse"
                style={{ backgroundColor: user.color }}
                title={`${user.name} is active`}
              />
            )}
          </div>
        ))}
        
        {onlineUsers.length > 5 && (
          <div className="relative ml-2">
            <div className="w-6 h-6 bg-gray-200 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium text-gray-600">
              +{onlineUsers.length - 5}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};