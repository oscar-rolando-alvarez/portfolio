import { useEffect, useState, useCallback } from 'react';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { Operation } from '@/types';

export const useOfflineSync = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingOperations, setPendingOperations] = useState<Operation[]>([]);
  const [syncInProgress, setSyncInProgress] = useState(false);
  
  const { canvasState, addOperation } = useCollaborationStore();

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      requestSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Open IndexedDB connection
  const openDB = useCallback(async () => {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('CollaborationCanvas', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('pendingOperations')) {
          const store = db.createObjectStore('pendingOperations', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('canvasState')) {
          db.createObjectStore('canvasState', { keyPath: 'id' });
        }
      };
    });
  }, []);

  // Store operation offline
  const storeOperationOffline = useCallback(async (operation: Operation) => {
    try {
      const db = await openDB();
      const transaction = db.transaction(['pendingOperations'], 'readwrite');
      const store = transaction.objectStore('pendingOperations');
      
      await new Promise<void>((resolve, reject) => {
        const request = store.put({
          ...operation,
          storedAt: Date.now()
        });
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });

      setPendingOperations(prev => [...prev, operation]);
      
      // Send message to service worker
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'STORE_PENDING_OPERATION',
          data: operation
        });
      }
      
      console.log('Operation stored offline:', operation.id);
    } catch (error) {
      console.error('Failed to store operation offline:', error);
    }
  }, [openDB]);

  // Get pending operations
  const getPendingOperations = useCallback(async (): Promise<Operation[]> => {
    try {
      const db = await openDB();
      const transaction = db.transaction(['pendingOperations'], 'readonly');
      const store = transaction.objectStore('pendingOperations');
      
      return new Promise<Operation[]>((resolve, reject) => {
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    } catch (error) {
      console.error('Failed to get pending operations:', error);
      return [];
    }
  }, [openDB]);

  // Remove synced operation
  const removeSyncedOperation = useCallback(async (operationId: string) => {
    try {
      const db = await openDB();
      const transaction = db.transaction(['pendingOperations'], 'readwrite');
      const store = transaction.objectStore('pendingOperations');
      
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(operationId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });

      setPendingOperations(prev => prev.filter(op => op.id !== operationId));
    } catch (error) {
      console.error('Failed to remove synced operation:', error);
    }
  }, [openDB]);

  // Cache canvas state
  const cacheCanvasState = useCallback(async (state: any) => {
    try {
      const db = await openDB();
      const transaction = db.transaction(['canvasState'], 'readwrite');
      const store = transaction.objectStore('canvasState');
      
      await new Promise<void>((resolve, reject) => {
        const request = store.put({
          id: 'current',
          state,
          timestamp: Date.now()
        });
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });

      // Send message to service worker
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'CACHE_CANVAS_STATE',
          data: state
        });
      }
    } catch (error) {
      console.error('Failed to cache canvas state:', error);
    }
  }, [openDB]);

  // Request sync
  const requestSync = useCallback(async () => {
    if (syncInProgress || !isOnline) return;

    setSyncInProgress(true);
    
    try {
      const pending = await getPendingOperations();
      
      if (pending.length === 0) {
        setSyncInProgress(false);
        return;
      }

      console.log(`Syncing ${pending.length} pending operations`);
      
      // Sort operations by timestamp
      const sortedOperations = pending.sort((a, b) => a.timestamp - b.timestamp);
      
      // Send operations to server
      for (const operation of sortedOperations) {
        try {
          const response = await fetch('/api/canvas/operations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(operation),
          });
          
          if (response.ok) {
            await removeSyncedOperation(operation.id);
            console.log('Synced operation:', operation.id);
          } else {
            console.error('Failed to sync operation:', operation.id, response.statusText);
            break; // Stop syncing if one fails
          }
        } catch (error) {
          console.error('Network error syncing operation:', operation.id, error);
          break; // Stop syncing on network error
        }
      }
      
      // Update pending operations count
      const remainingPending = await getPendingOperations();
      setPendingOperations(remainingPending);
      
      // Request background sync via service worker
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'REQUEST_SYNC'
        });
      }
      
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncInProgress(false);
    }
  }, [isOnline, syncInProgress, getPendingOperations, removeSyncedOperation]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingOperations.length > 0) {
      requestSync();
    }
  }, [isOnline, pendingOperations.length, requestSync]);

  // Cache canvas state periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (canvasState) {
        cacheCanvasState(canvasState);
      }
    }, 30000); // Cache every 30 seconds

    return () => clearInterval(interval);
  }, [canvasState, cacheCanvasState]);

  // Load pending operations on mount
  useEffect(() => {
    getPendingOperations().then(setPendingOperations);
  }, [getPendingOperations]);

  // Listen for service worker messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, data } = event.data;
      
      switch (type) {
        case 'SYNC_COMPLETE':
          console.log('Background sync completed:', data);
          getPendingOperations().then(setPendingOperations);
          break;
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleMessage);
      return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
    }
  }, [getPendingOperations]);

  // Enhanced operation handler that works offline
  const handleOperation = useCallback(async (operation: Operation) => {
    // Always apply operation locally first
    addOperation(operation);
    
    if (isOnline) {
      // Try to send to server immediately
      try {
        const response = await fetch('/api/canvas/operations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(operation),
        });
        
        if (!response.ok) {
          throw new Error(`Server error: ${response.statusText}`);
        }
        
        console.log('Operation sent to server:', operation.id);
      } catch (error) {
        console.error('Failed to send operation to server, storing offline:', error);
        await storeOperationOffline(operation);
      }
    } else {
      // Store for later sync
      await storeOperationOffline(operation);
    }
  }, [isOnline, addOperation, storeOperationOffline]);

  return {
    isOnline,
    pendingOperations: pendingOperations.length,
    syncInProgress,
    handleOperation,
    requestSync,
    cacheCanvasState,
  };
};