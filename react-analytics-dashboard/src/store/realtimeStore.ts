import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { WebSocketMessage, ChartData } from '@/types';
import { RealtimeState } from './types';

export const useRealtimeStore = create<RealtimeState>()(
  devtools(
    immer((set, get) => ({
      isConnected: false,
      connectionStatus: 'disconnected',
      lastMessage: null,
      messageHistory: [],
      subscriptions: new Set(),
      chartDataCache: new Map(),

      setConnectionStatus: (status) =>
        set((state) => {
          state.connectionStatus = status;
          state.isConnected = status === 'connected';
          
          if (status === 'disconnected' || status === 'error') {
            state.subscriptions.clear();
          }
        }),

      addMessage: (message) =>
        set((state) => {
          state.lastMessage = message;
          state.messageHistory.unshift(message);
          
          // Limit message history to prevent memory leaks
          if (state.messageHistory.length > 1000) {
            state.messageHistory = state.messageHistory.slice(0, 1000);
          }
        }),

      subscribe: (channel) =>
        set((state) => {
          state.subscriptions.add(channel);
        }),

      unsubscribe: (channel) =>
        set((state) => {
          state.subscriptions.delete(channel);
        }),

      updateChartData: (chartId, data) =>
        set((state) => {
          state.chartDataCache.set(chartId, data);
          
          // Limit cache size
          if (state.chartDataCache.size > 100) {
            const firstKey = state.chartDataCache.keys().next().value;
            state.chartDataCache.delete(firstKey);
          }
        }),

      clearMessageHistory: () =>
        set((state) => {
          state.messageHistory = [];
          state.lastMessage = null;
        }),
    })),
    {
      name: 'realtime-store',
    }
  )
);

// Utility functions for working with the realtime store
export const realtimeUtils = {
  isSubscribed: (channel: string): boolean => {
    return useRealtimeStore.getState().subscriptions.has(channel);
  },

  getChartData: (chartId: string): ChartData | undefined => {
    return useRealtimeStore.getState().chartDataCache.get(chartId);
  },

  getMessagesByType: (type: WebSocketMessage['type']): WebSocketMessage[] => {
    return useRealtimeStore.getState().messageHistory.filter(msg => msg.type === type);
  },

  getRecentMessages: (count: number = 10): WebSocketMessage[] => {
    return useRealtimeStore.getState().messageHistory.slice(0, count);
  },
};