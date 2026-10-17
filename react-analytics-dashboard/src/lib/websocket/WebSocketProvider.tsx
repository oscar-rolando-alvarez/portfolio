'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useRealtimeStore } from '@/store/realtimeStore';
import { useNotificationStore, createAlert } from '@/store/notificationStore';
import type { Alert, ChartData, RealtimeUpdate, WebSocketMessage } from '@/types';

interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  enabled: boolean;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  emit: (event: string, data: unknown) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: React.ReactNode;
  url?: string;
  /** Real-time streaming is opt-in so the dashboard works without a backend. */
  enabled?: boolean;
}

const MAX_RECONNECT_ATTEMPTS = 5;

export function WebSocketProvider({
  children,
  url = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001',
  enabled = process.env.NEXT_PUBLIC_ENABLE_REALTIME === 'true',
}: WebSocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const setConnectionStatus = useRealtimeStore((s) => s.setConnectionStatus);
  const addMessage = useRealtimeStore((s) => s.addMessage);
  const storeSubscribe = useRealtimeStore((s) => s.subscribe);
  const storeUnsubscribe = useRealtimeStore((s) => s.unsubscribe);
  const updateChartData = useRealtimeStore((s) => s.updateChartData);
  const isConnected = useRealtimeStore((s) => s.isConnected);
  const addAlert = useNotificationStore((s) => s.addAlert);

  useEffect(() => {
    if (!enabled) return;

    setConnectionStatus('connecting');
    // socket.io handles reconnection with exponential backoff natively.
    const client = io(url, {
      transports: ['websocket'],
      timeout: 10_000,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    });

    client.on('connect', () => setConnectionStatus('connected'));
    client.on('disconnect', () => setConnectionStatus('disconnected'));
    client.on('connect_error', () => setConnectionStatus('error'));
    client.io.on('reconnect_failed', () =>
      addAlert(
        createAlert.error(
          'Connection failed',
          'Unable to establish the real-time connection. Data shown may be stale.'
        )
      )
    );

    client.on('message', (message: WebSocketMessage) => {
      addMessage(message);
      if (message.type === 'data' && message.payload?.chartId) {
        updateChartData(message.payload.chartId, message.payload.data as ChartData);
      } else if (message.type === 'alert') {
        addAlert(message.payload as Alert);
      }
    });
    client.on('realtime_update', (update: RealtimeUpdate) => {
      updateChartData(update.chartId, update.data as unknown as ChartData);
    });
    client.on('alert', (alert: Alert) => addAlert(alert));

    // eslint-disable-next-line react-hooks/set-state-in-effect -- the socket instance is created by this effect
    setSocket(client);

    return () => {
      client.removeAllListeners();
      client.disconnect();
      setSocket(null);
    };
  }, [enabled, url, setConnectionStatus, addMessage, updateChartData, addAlert]);

  const subscribe = useCallback(
    (channel: string) => {
      if (!socket?.connected) return;
      socket.emit('subscribe', channel);
      storeSubscribe(channel);
    },
    [socket, storeSubscribe]
  );

  const unsubscribe = useCallback(
    (channel: string) => {
      if (!socket?.connected) return;
      socket.emit('unsubscribe', channel);
      storeUnsubscribe(channel);
    },
    [socket, storeUnsubscribe]
  );

  const emit = useCallback(
    (event: string, data: unknown) => {
      if (socket?.connected) socket.emit(event, data);
    },
    [socket]
  );

  const value = useMemo<WebSocketContextType>(
    () => ({ socket, isConnected, enabled, subscribe, unsubscribe, emit }),
    [socket, isConnected, enabled, subscribe, unsubscribe, emit]
  );

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

export function useRealtimeData(chartId: string) {
  const { subscribe, unsubscribe } = useWebSocket();
  const chartData = useRealtimeStore((state) => state.chartDataCache.get(chartId));

  useEffect(() => {
    const channel = `chart:${chartId}`;
    subscribe(channel);
    return () => unsubscribe(channel);
  }, [chartId, subscribe, unsubscribe]);

  return chartData;
}
