import React, { useEffect, useState } from 'react';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useSocket } from '@/hooks/useSocket';
import { User } from '@/types';
import { generateUserColor } from '@/lib/utils';

interface UserPresenceProps {
  children: React.ReactNode;
}

export const UserPresence: React.FC<UserPresenceProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const { currentUser, addUser, updateUser } = useCollaborationStore();
  const { connectionStatus, joinAsUser, sendCursorPosition, updateUser: updateSocketUser } = useSocket();

  // Initialize user session
  useEffect(() => {
    if (!isInitialized && connectionStatus.isConnected) {
      // Get or create user identity
      let userData = localStorage.getItem('collaboration-user');
      let user: Partial<User>;

      if (userData) {
        try {
          user = JSON.parse(userData);
        } catch {
          user = {};
        }
      } else {
        user = {};
      }

      // Ensure user has required properties
      if (!user.id) {
        user.id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      if (!user.name) {
        user.name = `User ${user.id.slice(-6)}`;
      }
      if (!user.color) {
        user.color = generateUserColor();
      }

      // Save user data
      localStorage.setItem('collaboration-user', JSON.stringify(user));

      // Join collaboration session
      joinAsUser(user);

      // Update store
      useCollaborationStore.setState({ 
        currentUser: {
          ...user,
          isOnline: true,
          cursor: { x: 0, y: 0 }
        } as User
      });

      setIsInitialized(true);
    }
  }, [connectionStatus.isConnected, isInitialized, joinAsUser]);

  // Handle cursor movement
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!currentUser || !connectionStatus.isConnected) return;

      const x = event.clientX;
      const y = event.clientY;

      // Update local cursor position
      updateUser(currentUser.id, { cursor: { x, y } });

      // Send to other users (throttled)
      sendCursorPosition(x, y);
    };

    // Throttle cursor updates
    let lastUpdate = 0;
    const throttledMouseMove = (event: MouseEvent) => {
      const now = Date.now();
      if (now - lastUpdate > 50) { // Update every 50ms
        handleMouseMove(event);
        lastUpdate = now;
      }
    };

    document.addEventListener('mousemove', throttledMouseMove);
    return () => document.removeEventListener('mousemove', throttledMouseMove);
  }, [currentUser, connectionStatus.isConnected, updateUser, sendCursorPosition]);

  // Handle user activity tracking
  useEffect(() => {
    if (!currentUser || !connectionStatus.isConnected) return;

    let activityTimeout: NodeJS.Timeout;

    const updateActivity = () => {
      updateSocketUser({ lastActive: Date.now() });
      
      // Reset timeout
      clearTimeout(activityTimeout);
      activityTimeout = setTimeout(() => {
        // Mark as inactive after 30 seconds
        updateSocketUser({ lastActive: Date.now() - 30000 });
      }, 30000);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity);
    });

    // Initial activity update
    updateActivity();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
      clearTimeout(activityTimeout);
    };
  }, [currentUser, connectionStatus.isConnected, updateSocketUser]);

  // Handle page visibility
  useEffect(() => {
    if (!currentUser) return;

    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      updateSocketUser({ isOnline: isVisible });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentUser, updateSocketUser]);

  // Handle beforeunload to notify other users
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentUser) {
        updateSocketUser({ isOnline: false });
        // Use sendBeacon for more reliable delivery
        const data = JSON.stringify({
          userId: currentUser.id,
          isOnline: false,
          timestamp: Date.now()
        });
        navigator.sendBeacon('/api/user-status', data);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentUser, updateSocketUser]);

  return <>{children}</>;
};