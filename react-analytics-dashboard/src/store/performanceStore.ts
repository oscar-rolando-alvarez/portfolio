import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { PerformanceMetrics } from '@/types';
import { PerformanceState } from './types';

const initialMetrics: PerformanceMetrics = {
  renderTime: 0,
  dataLoadTime: 0,
  memoryUsage: 0,
  dataPoints: 0,
  componentCount: 0,
  rerenderCount: 0,
};

export const usePerformanceStore = create<PerformanceState>()(
  devtools(
    immer((set, get) => ({
      metrics: initialMetrics,
      isMonitoring: false,
      history: [],
      maxHistorySize: 100,

      updateMetrics: (metrics) =>
        set((state) => {
          // Update current metrics
          Object.assign(state.metrics, metrics);
          
          // Add to history if monitoring
          if (state.isMonitoring) {
            const timestamp = Date.now();
            const snapshot = {
              ...state.metrics,
              timestamp,
            };
            
            state.history.unshift(snapshot);
            
            // Trim history to max size
            if (state.history.length > state.maxHistorySize) {
              state.history = state.history.slice(0, state.maxHistorySize);
            }
          }
        }),

      startMonitoring: () =>
        set((state) => {
          state.isMonitoring = true;
          
          // Start performance monitoring if in browser
          if (typeof window !== 'undefined') {
            // Monitor memory usage
            const updateMemoryUsage = () => {
              if ('memory' in performance) {
                const memory = (performance as any).memory;
                state.metrics.memoryUsage = memory.usedJSHeapSize;
              }
            };
            
            // Update memory usage periodically
            const memoryInterval = setInterval(updateMemoryUsage, 5000);
            
            // Store interval ID for cleanup
            (window as any).__performanceMonitoringInterval = memoryInterval;
          }
        }),

      stopMonitoring: () =>
        set((state) => {
          state.isMonitoring = false;
          
          // Cleanup monitoring if in browser
          if (typeof window !== 'undefined') {
            const interval = (window as any).__performanceMonitoringInterval;
            if (interval) {
              clearInterval(interval);
              delete (window as any).__performanceMonitoringInterval;
            }
          }
        }),

      clearHistory: () =>
        set((state) => {
          state.history = [];
        }),

      setMaxHistorySize: (size) =>
        set((state) => {
          state.maxHistorySize = size;
          
          // Trim current history if needed
          if (state.history.length > size) {
            state.history = state.history.slice(0, size);
          }
        }),
    })),
    {
      name: 'performance-store',
    }
  )
);

// Performance monitoring utilities
export const performanceUtils = {
  // Measure render time
  measureRender: (componentName: string, fn: () => void): number => {
    const start = performance.now();
    fn();
    const end = performance.now();
    const renderTime = end - start;
    
    usePerformanceStore.getState().updateMetrics({
      renderTime,
      rerenderCount: usePerformanceStore.getState().metrics.rerenderCount + 1,
    });
    
    return renderTime;
  },

  // Measure data loading time
  measureDataLoad: async <T>(fn: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    const dataLoadTime = end - start;
    
    usePerformanceStore.getState().updateMetrics({ dataLoadTime });
    
    return result;
  },

  // Count data points
  countDataPoints: (count: number): void => {
    usePerformanceStore.getState().updateMetrics({ dataPoints: count });
  },

  // Count components
  countComponents: (count: number): void => {
    usePerformanceStore.getState().updateMetrics({ componentCount: count });
  },

  // Get performance summary
  getSummary: () => {
    const { metrics, history } = usePerformanceStore.getState();
    const recentHistory = history.slice(0, 10);
    
    return {
      current: metrics,
      average: recentHistory.length > 0 ? {
        renderTime: recentHistory.reduce((sum, m) => sum + m.renderTime, 0) / recentHistory.length,
        dataLoadTime: recentHistory.reduce((sum, m) => sum + m.dataLoadTime, 0) / recentHistory.length,
        memoryUsage: recentHistory.reduce((sum, m) => sum + m.memoryUsage, 0) / recentHistory.length,
      } : metrics,
      history: recentHistory,
    };
  },
};