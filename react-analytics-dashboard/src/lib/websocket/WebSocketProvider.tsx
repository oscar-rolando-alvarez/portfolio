'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useRealtimeStore } from '@/store/realtimeStore';
import { useNotificationStore, createAlert } from '@/store/notificationStore';
import { WebSocketMessage, RealtimeUpdate } from '@/types';

interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  reconnectAttempts: number;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  emit: (event: string, data: any) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: React.ReactNode;
  url?: string;
  options?: any;
}

export function WebSocketProvider({ 
  children, 
  url = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001',
  options = {}
}: WebSocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000; // Start with 1 second

  const { 
    setConnectionStatus, 
    addMessage, 
    subscribe: storeSubscribe, 
    unsubscribe: storeUnsubscribe,
    updateChartData,
    isConnected 
  } = useRealtimeStore();
  
  const { addAlert } = useNotificationStore();

  const connect = () => {
    if (socket?.connected) return;

    setConnectionStatus('connecting');
    
    const newSocket = io(url, {
      transports: ['websocket'],
      timeout: 10000,
      ...options,
    });

    // Connection events
    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      setReconnectAttempts(0);
      
      addAlert(createAlert.success(
        'Connected',
        'Real-time connection established'
      ));
    });

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setConnectionStatus('disconnected');
      
      if (reason !== 'io client disconnect') {
        // Attempt to reconnect if not manually disconnected
        attemptReconnect();
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setConnectionStatus('error');
      attemptReconnect();
    });

    // Data events
    newSocket.on('message', (message: WebSocketMessage) => {
      addMessage(message);
      handleMessage(message);
    });

    newSocket.on('realtime_update', (update: RealtimeUpdate) => {
      updateChartData(update.chartId, update.data as any);
    });

    newSocket.on('alert', (alert) => {
      addAlert(alert);
    });

    // System events
    newSocket.on('heartbeat', () => {
      addMessage({
        type: 'heartbeat',
        payload: { timestamp: new Date() },
        timestamp: new Date(),
      });
    });

    setSocket(newSocket);
  };

  const attemptReconnect = () => {
    if (reconnectAttempts >= maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      addAlert(createAlert.error(
        'Connection Failed',
        'Unable to establish real-time connection. Please refresh the page.'
      ));
      return;
    }

    const delay = reconnectDelay * Math.pow(2, reconnectAttempts); // Exponential backoff
    
    reconnectTimeoutRef.current = setTimeout(() => {
      console.log(`Attempting to reconnect (${reconnectAttempts + 1}/${maxReconnectAttempts})`);
      setReconnectAttempts(prev => prev + 1);
      connect();
    }, delay);
  };

  const handleMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case 'data':
        // Handle real-time data updates
        if (message.payload.chartId) {
          updateChartData(message.payload.chartId, message.payload.data);
        }
        break;
      
      case 'alert':
        addAlert(message.payload);
        break;
      
      case 'system':
        console.log('System message:', message.payload);
        break;
      
      default:
        console.log('Unknown message type:', message.type);
    }
  };

  const subscribe = (channel: string) => {
    if (socket?.connected) {
      socket.emit('subscribe', channel);
      storeSubscribe(channel);
    }
  };

  const unsubscribe = (channel: string) => {
    if (socket?.connected) {
      socket.emit('unsubscribe', channel);
      storeUnsubscribe(channel);
    }
  };

  const emit = (event: string, data: any) => {
    if (socket?.connected) {
      socket.emit(event, data);
    }
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socket) {
        socket.disconnect();
      }
    };
  }, [url]);

  const contextValue: WebSocketContextType = {
    socket,
    isConnected,
    reconnectAttempts,
    subscribe,
    unsubscribe,
    emit,
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

// Custom hooks for common WebSocket operations
export function useRealtimeData(chartId: string) {
  const { subscribe, unsubscribe } = useWebSocket();
  const chartData = useRealtimeStore(state => state.chartDataCache.get(chartId));

  useEffect(() => {
    const channel = `chart:${chartId}`;
    subscribe(channel);

    return () => {
      unsubscribe(channel);
    };
  }, [chartId, subscribe, unsubscribe]);

  return chartData;
}

export function useRealtimeNotifications() {
  const { subscribe, unsubscribe } = useWebSocket();

  useEffect(() => {
    const channel = 'notifications';
    subscribe(channel);

    return () => {
      unsubscribe(channel);
    };
  }, [subscribe, unsubscribe]);
}