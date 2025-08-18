const CACHE_NAME = 'collaboration-canvas-v1';
const STATIC_CACHE = 'static-cache-v1';
const DYNAMIC_CACHE = 'dynamic-cache-v1';

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/vite.svg',
  // Add more static assets as needed
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing');
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      caches.open(DYNAMIC_CACHE), // Just open the dynamic cache
    ])
  );
  
  // Force activation of new service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Take control of all clients
  self.clients.claim();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Handle different types of requests
  if (url.origin === location.origin) {
    // Same origin requests
    if (request.url.includes('/api/')) {
      // API requests - try network first, fallback to cache
      event.respondWith(networkFirstStrategy(request));
    } else if (request.url.includes('/assets/') || request.url.includes('.js') || request.url.includes('.css')) {
      // Static assets - cache first
      event.respondWith(cacheFirstStrategy(request));
    } else {
      // HTML pages - network first with cache fallback
      event.respondWith(networkFirstStrategy(request));
    }
  } else {
    // External requests - network only
    event.respondWith(fetch(request));
  }
});

// Cache first strategy - check cache first, then network
async function cacheFirstStrategy(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Cache first strategy failed:', error);
    throw error;
  }
}

// Network first strategy - try network first, fallback to cache
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Network failed, trying cache:', error);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If it's a navigation request and we have no cache, return offline page
    if (request.mode === 'navigate') {
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Offline - Collaboration Canvas</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background-color: #f5f5f5;
              color: #333;
            }
            .offline-container {
              text-align: center;
              max-width: 400px;
              padding: 2rem;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .offline-icon {
              font-size: 4rem;
              margin-bottom: 1rem;
            }
            h1 {
              margin: 0 0 1rem 0;
              color: #e74c3c;
            }
            p {
              margin: 0 0 1.5rem 0;
              line-height: 1.5;
              color: #666;
            }
            .retry-btn {
              background: #3498db;
              color: white;
              border: none;
              padding: 0.75rem 1.5rem;
              border-radius: 4px;
              cursor: pointer;
              font-size: 1rem;
            }
            .retry-btn:hover {
              background: #2980b9;
            }
          </style>
        </head>
        <body>
          <div class="offline-container">
            <div class="offline-icon">📡</div>
            <h1>You're Offline</h1>
            <p>
              It looks like you've lost your internet connection. 
              Some features may not work until you reconnect.
            </p>
            <button class="retry-btn" onclick="window.location.reload()">
              Try Again
            </button>
          </div>
        </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' },
        status: 200
      });
    }
    
    throw error;
  }
}

// Background sync for offline operations
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);
  
  if (event.tag === 'canvas-operations') {
    event.waitUntil(syncCanvasOperations());
  }
});

// Sync canvas operations when back online
async function syncCanvasOperations() {
  try {
    // Get pending operations from IndexedDB
    const db = await openIndexedDB();
    const operations = await getPendingOperations(db);
    
    if (operations.length === 0) {
      console.log('No pending operations to sync');
      return;
    }
    
    console.log(`Syncing ${operations.length} pending operations`);
    
    // Send operations to server
    for (const operation of operations) {
      try {
        const response = await fetch('/api/canvas/operations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(operation),
        });
        
        if (response.ok) {
          // Remove from pending operations
          await removePendingOperation(db, operation.id);
          console.log('Synced operation:', operation.id);
        }
      } catch (error) {
        console.error('Failed to sync operation:', operation.id, error);
      }
    }
    
    // Notify clients about sync completion
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        data: { syncedCount: operations.length }
      });
    });
    
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// IndexedDB operations for offline storage
async function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CollaborationCanvas', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object stores
      if (!db.objectStoreNames.contains('pendingOperations')) {
        const store = db.createObjectStore('pendingOperations', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('canvasState')) {
        db.createObjectStore('canvasState', { keyPath: 'id' });
      }
    };
  });
}

async function getPendingOperations(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingOperations'], 'readonly');
    const store = transaction.objectStore('pendingOperations');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function removePendingOperation(db, operationId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingOperations'], 'readwrite');
    const store = transaction.objectStore('pendingOperations');
    const request = store.delete(operationId);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'CACHE_CANVAS_STATE':
      cacheCanvasState(data);
      break;
    case 'STORE_PENDING_OPERATION':
      storePendingOperation(data);
      break;
    case 'REQUEST_SYNC':
      // Request background sync
      self.registration.sync.register('canvas-operations');
      break;
  }
});

async function cacheCanvasState(canvasState) {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['canvasState'], 'readwrite');
    const store = transaction.objectStore('canvasState');
    
    await store.put({
      id: 'current',
      state: canvasState,
      timestamp: Date.now()
    });
    
    console.log('Canvas state cached');
  } catch (error) {
    console.error('Failed to cache canvas state:', error);
  }
}

async function storePendingOperation(operation) {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction(['pendingOperations'], 'readwrite');
    const store = transaction.objectStore('pendingOperations');
    
    await store.put({
      ...operation,
      storedAt: Date.now()
    });
    
    console.log('Pending operation stored:', operation.id);
  } catch (error) {
    console.error('Failed to store pending operation:', error);
  }
}

// Periodic cleanup of old cache entries
setInterval(async () => {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const requests = await cache.keys();
    
    // Remove entries older than 7 days
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    for (const request of requests) {
      const response = await cache.match(request);
      const dateHeader = response.headers.get('date');
      
      if (dateHeader) {
        const responseDate = new Date(dateHeader).getTime();
        if (responseDate < weekAgo) {
          await cache.delete(request);
          console.log('Cleaned up old cache entry:', request.url);
        }
      }
    }
  } catch (error) {
    console.error('Cache cleanup failed:', error);
  }
}, 24 * 60 * 60 * 1000); // Run daily