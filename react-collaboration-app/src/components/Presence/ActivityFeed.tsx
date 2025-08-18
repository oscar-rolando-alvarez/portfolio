import React, { useState, useEffect } from 'react';
import { Bell, User, Edit, MessageCircle, Eye, EyeOff } from 'lucide-react';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { Button } from '@/components/ui/Button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatTimestamp } from '@/lib/utils';

interface ActivityItem {
  id: string;
  type: 'user_joined' | 'user_left' | 'object_created' | 'object_modified' | 'comment_added';
  userId: string;
  userName: string;
  userColor: string;
  timestamp: number;
  data?: any;
}

export const ActivityFeed: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const { users, currentUser } = useCollaborationStore();

  // Listen to store changes and create activity items
  useEffect(() => {
    const unsubscribeUsers = useCollaborationStore.subscribe(
      (state) => state.users,
      (users, prevUsers) => {
        // Check for new users
        users.forEach(user => {
          const prevUser = prevUsers.find(u => u.id === user.id);
          if (!prevUser && user.id !== currentUser?.id) {
            addActivity({
              type: 'user_joined',
              userId: user.id,
              userName: user.name,
              userColor: user.color,
              timestamp: Date.now(),
            });
          } else if (prevUser && !user.isOnline && prevUser.isOnline) {
            addActivity({
              type: 'user_left',
              userId: user.id,
              userName: user.name,
              userColor: user.color,
              timestamp: Date.now(),
            });
          }
        });

        // Check for users who left
        prevUsers.forEach(prevUser => {
          const currentUser = users.find(u => u.id === prevUser.id);
          if (!currentUser && prevUser.isOnline) {
            addActivity({
              type: 'user_left',
              userId: prevUser.id,
              userName: prevUser.name,
              userColor: prevUser.color,
              timestamp: Date.now(),
            });
          }
        });
      },
      { fireImmediately: false }
    );

    const unsubscribeCanvas = useCollaborationStore.subscribe(
      (state) => state.canvasState.objects,
      (objects, prevObjects) => {
        // Check for new objects
        objects.forEach(obj => {
          const prevObj = prevObjects.find(o => o.id === obj.id);
          if (!prevObj && obj.userId !== currentUser?.id) {
            const user = users.find(u => u.id === obj.userId);
            if (user) {
              addActivity({
                type: 'object_created',
                userId: user.id,
                userName: user.name,
                userColor: user.color,
                timestamp: obj.timestamp,
                data: { objectType: obj.type },
              });
            }
          } else if (prevObj && obj.version > prevObj.version && obj.userId !== currentUser?.id) {
            const user = users.find(u => u.id === obj.userId);
            if (user) {
              addActivity({
                type: 'object_modified',
                userId: user.id,
                userName: user.name,
                userColor: user.color,
                timestamp: obj.timestamp,
                data: { objectType: obj.type },
              });
            }
          }
        });
      },
      { fireImmediately: false }
    );

    const unsubscribeComments = useCollaborationStore.subscribe(
      (state) => state.comments,
      (comments, prevComments) => {
        comments.forEach(comment => {
          const prevComment = prevComments.find(c => c.id === comment.id);
          if (!prevComment && comment.userId !== currentUser?.id) {
            const user = users.find(u => u.id === comment.userId);
            if (user) {
              addActivity({
                type: 'comment_added',
                userId: user.id,
                userName: user.name,
                userColor: user.color,
                timestamp: comment.timestamp,
                data: { text: comment.text.slice(0, 50) },
              });
            }
          }
        });
      },
      { fireImmediately: false }
    );

    return () => {
      unsubscribeUsers();
      unsubscribeCanvas();
      unsubscribeComments();
    };
  }, [users, currentUser]);

  const addActivity = (activity: Omit<ActivityItem, 'id'>) => {
    const newActivity: ActivityItem = {
      ...activity,
      id: `${activity.timestamp}_${Math.random().toString(36).substr(2, 9)}`,
    };

    setActivities(prev => {
      const updated = [newActivity, ...prev].slice(0, 50); // Keep last 50 activities
      return updated;
    });
  };

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'user_joined':
        return <User className="h-4 w-4 text-green-600" />;
      case 'user_left':
        return <User className="h-4 w-4 text-red-600" />;
      case 'object_created':
      case 'object_modified':
        return <Edit className="h-4 w-4 text-blue-600" />;
      case 'comment_added':
        return <MessageCircle className="h-4 w-4 text-purple-600" />;
      default:
        return <Bell className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActivityText = (activity: ActivityItem) => {
    switch (activity.type) {
      case 'user_joined':
        return `${activity.userName} joined the session`;
      case 'user_left':
        return `${activity.userName} left the session`;
      case 'object_created':
        return `${activity.userName} created a ${activity.data?.objectType || 'object'}`;
      case 'object_modified':
        return `${activity.userName} modified a ${activity.data?.objectType || 'object'}`;
      case 'comment_added':
        return `${activity.userName} added a comment: "${activity.data?.text || ''}"`;
      default:
        return `${activity.userName} performed an action`;
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsVisible(!isVisible)}
        className="fixed bottom-4 right-4 z-40 bg-white shadow-md border border-gray-200 hover:bg-gray-50"
        title={isVisible ? "Hide activity feed" : "Show activity feed"}
      >
        {isVisible ? <EyeOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {activities.length > 0 && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
        )}
      </Button>

      {/* Activity Feed */}
      {isVisible && (
        <div className="fixed bottom-16 right-4 z-40 w-80 bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-gray-600" />
              <h3 className="font-medium text-gray-900">Activity</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActivities([])}
              className="h-6 w-6"
              title="Clear all activities"
            >
              <EyeOff className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activities.length > 0 ? (
              <div className="p-2">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-2 rounded hover:bg-gray-50"
                  >
                    <div className="flex-shrink-0">
                      <UserAvatar
                        user={{
                          id: activity.userId,
                          name: activity.userName,
                          color: activity.userColor,
                          isOnline: true,
                        }}
                        size="sm"
                        showStatus={false}
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getActivityIcon(activity.type)}
                        <span className="text-xs text-gray-500">
                          {formatTimestamp(activity.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">
                        {getActivityText(activity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};