import { useEffect, useCallback, useState } from 'react';
import { getSocketManager } from '@/lib/socket';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { User, Operation, Comment } from '@/types';

export const useSocket = () => {
  const socketManager = getSocketManager();
  const [connectionStatus, setConnectionStatus] = useState(socketManager.getConnectionStatus());
  
  const {
    currentUser,
    setCanvas,
    addUser,
    removeUser,
    updateUser,
    addOperation,
    addComment,
    updateComment,
    deleteComment,
  } = useCollaborationStore();

  // Update connection status
  useEffect(() => {
    const updateStatus = () => {
      setConnectionStatus(socketManager.getConnectionStatus());
    };

    socketManager.on('connected', updateStatus);
    socketManager.on('disconnected', updateStatus);
    socketManager.on('connect_error', updateStatus);

    return () => {
      socketManager.off('connected', updateStatus);
      socketManager.off('disconnected', updateStatus);
      socketManager.off('connect_error', updateStatus);
    };
  }, [socketManager]);

  // Setup event handlers
  useEffect(() => {
    // Canvas events
    const handleCanvasOperation = (operation: Operation) => {
      addOperation(operation);
    };

    const handleCanvasState = (state: any) => {
      // Apply full canvas state (used for initial sync)
      console.log('Received canvas state:', state);
    };

    // User events
    const handleUserJoined = (user: User) => {
      addUser(user);
    };

    const handleUserLeft = (userId: string) => {
      removeUser(userId);
    };

    const handleUserUpdated = (data: { userId: string; updates: Partial<User> }) => {
      updateUser(data.userId, data.updates);
    };

    const handleCursorUpdate = (data: { userId: string; cursor: { x: number; y: number } }) => {
      updateUser(data.userId, { cursor: data.cursor });
    };

    // Comment events
    const handleCommentAdded = (comment: Comment) => {
      addComment(comment);
    };

    const handleCommentUpdated = (data: { commentId: string; updates: Partial<Comment> }) => {
      updateComment(data.commentId, data.updates);
    };

    const handleCommentDeleted = (commentId: string) => {
      deleteComment(commentId);
    };

    // WebRTC events (handled by WebRTC hook)
    const handleWebRTCSignal = (data: { userId: string; signal: any }) => {
      // This will be handled by the WebRTC hook
      window.dispatchEvent(new CustomEvent('webrtc-signal', { detail: data }));
    };

    // Workspace events
    const handleWorkspaceState = (data: any) => {
      console.log('Received workspace state:', data);
      // Update store with workspace data
      if (data.users) {
        data.users.forEach((user: User) => {
          if (user.id !== currentUser?.id) {
            addUser(user);
          }
        });
      }
    };

    // Register event handlers
    socketManager.on('canvas:operation', handleCanvasOperation);
    socketManager.on('canvas:state', handleCanvasState);
    socketManager.on('user:joined', handleUserJoined);
    socketManager.on('user:left', handleUserLeft);
    socketManager.on('user:updated', handleUserUpdated);
    socketManager.on('cursor:update', handleCursorUpdate);
    socketManager.on('comment:added', handleCommentAdded);
    socketManager.on('comment:updated', handleCommentUpdated);
    socketManager.on('comment:deleted', handleCommentDeleted);
    socketManager.on('webrtc:signal', handleWebRTCSignal);
    socketManager.on('workspace:state', handleWorkspaceState);

    return () => {
      socketManager.off('canvas:operation', handleCanvasOperation);
      socketManager.off('canvas:state', handleCanvasState);
      socketManager.off('user:joined', handleUserJoined);
      socketManager.off('user:left', handleUserLeft);
      socketManager.off('user:updated', handleUserUpdated);
      socketManager.off('cursor:update', handleCursorUpdate);
      socketManager.off('comment:added', handleCommentAdded);
      socketManager.off('comment:updated', handleCommentUpdated);
      socketManager.off('comment:deleted', handleCommentDeleted);
      socketManager.off('webrtc:signal', handleWebRTCSignal);
      socketManager.off('workspace:state', handleWorkspaceState);
    };
  }, [
    socketManager,
    addOperation,
    addUser,
    removeUser,
    updateUser,
    addComment,
    updateComment,
    deleteComment,
    currentUser,
  ]);

  // Public methods
  const joinWorkspace = useCallback((workspaceId: string) => {
    socketManager.joinWorkspace(workspaceId);
  }, [socketManager]);

  const joinAsUser = useCallback((userData: Partial<User>) => {
    socketManager.joinAsUser(userData);
  }, [socketManager]);

  const sendOperation = useCallback((operation: Operation) => {
    socketManager.sendOperation(operation);
  }, [socketManager]);

  const sendCursorPosition = useCallback((x: number, y: number) => {
    socketManager.sendCursorPosition(x, y);
  }, [socketManager]);

  const updateUserData = useCallback((updates: Partial<User>) => {
    socketManager.updateUser(updates);
  }, [socketManager]);

  const sendComment = useCallback((comment: Comment) => {
    socketManager.addComment(comment);
  }, [socketManager]);

  const sendCommentUpdate = useCallback((commentId: string, updates: Partial<Comment>) => {
    socketManager.updateComment(commentId, updates);
  }, [socketManager]);

  const sendCommentDelete = useCallback((commentId: string) => {
    socketManager.deleteComment(commentId);
  }, [socketManager]);

  const requestSync = useCallback(() => {
    socketManager.requestCanvasSync();
  }, [socketManager]);

  // Connection management
  const disconnect = useCallback(() => {
    socketManager.disconnect();
  }, [socketManager]);

  const getSocket = useCallback(() => {
    return socketManager.getSocket();
  }, [socketManager]);

  return {
    connectionStatus,
    joinWorkspace,
    joinAsUser,
    sendOperation,
    sendCursorPosition,
    updateUser: updateUserData,
    sendComment,
    sendCommentUpdate,
    sendCommentDelete,
    requestSync,
    disconnect,
    getSocket,
  };
};