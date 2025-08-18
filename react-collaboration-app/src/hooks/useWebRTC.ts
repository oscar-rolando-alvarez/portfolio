import { useEffect, useCallback, useState } from 'react';
import { getWebRTCManager } from '@/lib/webrtc';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { RTCMessage, MediaState } from '@/types';

export const useWebRTC = () => {
  const webRTCManager = getWebRTCManager();
  const [mediaState, setMediaState] = useState<MediaState>({ audio: false, video: false, screen: false });
  const [isConnecting, setIsConnecting] = useState(false);
  const { 
    currentUser, 
    addUser, 
    removeUser, 
    updateUser, 
    addOperation,
    setMediaState: setStoreMediaState 
  } = useCollaborationStore();

  // Initialize WebRTC event handlers
  useEffect(() => {
    const handleMessage = (message: RTCMessage) => {
      switch (message.type) {
        case 'operation':
          addOperation(message.data);
          break;
        case 'cursor':
          if (message.userId !== currentUser?.id) {
            updateUser(message.userId, {
              cursor: message.data
            });
          }
          break;
        case 'voice':
        case 'video':
          // Handle voice/video data
          break;
        case 'chat':
          // Handle chat messages
          break;
      }
    };

    const handlePeerConnected = (userId: string) => {
      console.log(`Peer connected: ${userId}`);
      setIsConnecting(false);
    };

    const handlePeerDisconnected = (userId: string) => {
      console.log(`Peer disconnected: ${userId}`);
      removeUser(userId);
    };

    webRTCManager.onMessageReceived(handleMessage);
    webRTCManager.onPeerConnect(handlePeerConnected);
    webRTCManager.onPeerDisconnect(handlePeerDisconnected);

    // Listen for peer streams
    const handlePeerStream = (event: CustomEvent) => {
      const { userId, stream } = event.detail;
      // Update store or trigger UI update for incoming stream
      console.log(`Received stream from user: ${userId}`, stream);
    };

    window.addEventListener('peer-stream', handlePeerStream as EventListener);

    return () => {
      window.removeEventListener('peer-stream', handlePeerStream as EventListener);
    };
  }, [webRTCManager, currentUser, addOperation, updateUser, removeUser]);

  // Connect to a peer
  const connectToPeer = useCallback((userId: string, initiator: boolean = false) => {
    setIsConnecting(true);
    webRTCManager.initializePeer(userId, initiator);
  }, [webRTCManager]);

  // Handle incoming WebRTC signal
  const handleSignal = useCallback((userId: string, signal: any) => {
    webRTCManager.handleSignal(userId, signal);
  }, [webRTCManager]);

  // Send operation to peers
  const sendOperation = useCallback((operation: any) => {
    webRTCManager.sendOperation(operation);
  }, [webRTCManager]);

  // Send cursor position
  const sendCursorPosition = useCallback((x: number, y: number) => {
    if (currentUser) {
      webRTCManager.sendCursorPosition(x, y, currentUser.id);
    }
  }, [webRTCManager, currentUser]);

  // Toggle audio
  const toggleAudio = useCallback(async () => {
    const newState = !mediaState.audio;
    const success = await webRTCManager.toggleAudio(newState);
    if (success) {
      const updatedState = { ...mediaState, audio: newState };
      setMediaState(updatedState);
      setStoreMediaState(updatedState);
    }
    return success;
  }, [webRTCManager, mediaState, setStoreMediaState]);

  // Toggle video
  const toggleVideo = useCallback(async () => {
    const newState = !mediaState.video;
    const success = await webRTCManager.toggleVideo(newState);
    if (success) {
      const updatedState = { ...mediaState, video: newState, screen: false };
      setMediaState(updatedState);
      setStoreMediaState(updatedState);
    }
    return success;
  }, [webRTCManager, mediaState, setStoreMediaState]);

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    let success = false;
    if (mediaState.screen) {
      await webRTCManager.stopScreenShare();
      success = true;
    } else {
      success = await webRTCManager.startScreenShare();
    }
    
    if (success) {
      const updatedState = { ...mediaState, screen: !mediaState.screen, video: false };
      setMediaState(updatedState);
      setStoreMediaState(updatedState);
    }
    return success;
  }, [webRTCManager, mediaState, setStoreMediaState]);

  // Get local media stream
  const getLocalStream = useCallback(() => {
    return webRTCManager.getLocalStream();
  }, [webRTCManager]);

  // Get peer media stream
  const getPeerStream = useCallback((userId: string) => {
    return webRTCManager.getPeerStream(userId);
  }, [webRTCManager]);

  // Disconnect from a peer
  const disconnectFromPeer = useCallback((userId: string) => {
    webRTCManager.removePeer(userId);
  }, [webRTCManager]);

  // Update media state from WebRTC manager
  useEffect(() => {
    const currentState = webRTCManager.getMediaState();
    setMediaState(currentState);
    setStoreMediaState(currentState);
  }, [webRTCManager, setStoreMediaState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      webRTCManager.cleanup();
    };
  }, [webRTCManager]);

  return {
    mediaState,
    isConnecting,
    connectToPeer,
    handleSignal,
    sendOperation,
    sendCursorPosition,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    getLocalStream,
    getPeerStream,
    disconnectFromPeer,
  };
};