const CACHE_NAME = 'vue-pm-v1'
const OFFLINE_URL = '/offline'

// Files to cache for offline functionality
const STATIC_CACHE_URLS = [
  '/',
  '/dashboard',
  '/tasks',
  '/projects',
  '/calendar',
  '/offline',
  '/manifest.json',
  // Add your static assets here
  '/icon-192x192.png',
  '/icon-512x512.png'
]

// API endpoints to cache
const API_CACHE_URLS = [
  '/api/auth/me',
  '/api/projects',
  '/api/tasks'
]

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...')
  
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME)
        console.log('Service Worker: Caching static files')
        await cache.addAll(STATIC_CACHE_URLS)
        
        // Force the waiting service worker to become the active service worker
        self.skipWaiting()
      } catch (error) {
        console.error('Service Worker: Failed to cache static files', error)
      }
    })()
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...')
  
  event.waitUntil(
    (async () => {
      try {
        // Delete old caches
        const cacheNames = await caches.keys()
        await Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== CACHE_NAME)
            .map(cacheName => {
              console.log('Service Worker: Deleting old cache', cacheName)
              return caches.delete(cacheName)
            })
        )
        
        // Take control of all clients
        await self.clients.claim()
      } catch (error) {
        console.error('Service Worker: Failed to activate', error)
      }
    })()
  )
})

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  
  // Only handle HTTP(S) requests
  if (!url.protocol.startsWith('http')) {
    return
  }
  
  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Try to get from network first
          const networkResponse = await fetch(request)
          
          // Cache successful responses
          if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME)
            cache.put(request, networkResponse.clone())
          }
          
          return networkResponse
        } catch (error) {
          console.log('Service Worker: Network failed, serving from cache')
          
          // Try to serve from cache
          const cachedResponse = await caches.match(request)
          if (cachedResponse) {
            return cachedResponse
          }
          
          // Fallback to offline page for navigation requests
          return caches.match(OFFLINE_URL)
        }
      })()
    )
    return
  }
  
  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        try {
          // Try network first for API requests
          const networkResponse = await fetch(request)
          
          // Cache successful GET requests
          if (networkResponse.ok && request.method === 'GET') {
            const cache = await caches.open(CACHE_NAME)
            cache.put(request, networkResponse.clone())
          }
          
          return networkResponse
        } catch (error) {
          console.log('Service Worker: API request failed, trying cache')
          
          // For GET requests, try to serve from cache
          if (request.method === 'GET') {
            const cachedResponse = await caches.match(request)
            if (cachedResponse) {
              return cachedResponse
            }
          }
          
          // Return error response for failed API requests
          return new Response(
            JSON.stringify({ error: 'Network error, please try again' }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'application/json' }
            }
          )
        }
      })()
    )
    return
  }
  
  // Handle static resource requests
  event.respondWith(
    (async () => {
      try {
        // Try cache first for static resources
        const cachedResponse = await caches.match(request)
        if (cachedResponse) {
          return cachedResponse
        }
        
        // Fallback to network
        const networkResponse = await fetch(request)
        
        // Cache successful responses
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME)
          cache.put(request, networkResponse.clone())
        }
        
        return networkResponse
      } catch (error) {
        console.log('Service Worker: Failed to serve resource', error)
        
        // Return a fallback response or empty response
        return new Response('Resource not available offline', {
          status: 503,
          statusText: 'Service Unavailable'
        })
      }
    })()
  )
})

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered', event.tag)
  
  if (event.tag === 'sync-tasks') {
    event.waitUntil(syncTasks())
  }
  
  if (event.tag === 'sync-projects') {
    event.waitUntil(syncProjects())
  }
})

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received')
  
  if (!event.data) {
    return
  }
  
  const data = event.data.json()
  const options = {
    body: data.body,
    icon: '/icon-192x192.png',
    badge: '/icon-96x96.png',
    tag: data.tag || 'default',
    data: data.data || {},
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
    silent: data.silent || false
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked')
  
  event.notification.close()
  
  const data = event.notification.data
  let url = '/'
  
  // Determine URL based on notification data
  if (data.taskId) {
    url = `/tasks/${data.taskId}`
  } else if (data.projectId) {
    url = `/projects/${data.projectId}`
  } else if (data.url) {
    url = data.url
  }
  
  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to find an existing window
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus()
            client.navigate(url)
            return
          }
        }
        
        // No existing window, open a new one
        if (clients.openWindow) {
          return clients.openWindow(url)
        }
      })
  )
})

// Utility functions for background sync
async function syncTasks() {
  try {
    // Get offline actions from IndexedDB or localStorage
    const offlineActions = getOfflineActions('tasks')
    
    for (const action of offlineActions) {
      try {
        await fetch(action.url, {
          method: action.method,
          headers: action.headers,
          body: action.body
        })
        
        // Remove successful action from offline storage
        removeOfflineAction('tasks', action.id)
      } catch (error) {
        console.error('Failed to sync task action:', error)
      }
    }
  } catch (error) {
    console.error('Failed to sync tasks:', error)
  }
}

async function syncProjects() {
  try {
    // Similar to syncTasks but for projects
    const offlineActions = getOfflineActions('projects')
    
    for (const action of offlineActions) {
      try {
        await fetch(action.url, {
          method: action.method,
          headers: action.headers,
          body: action.body
        })
        
        removeOfflineAction('projects', action.id)
      } catch (error) {
        console.error('Failed to sync project action:', error)
      }
    }
  } catch (error) {
    console.error('Failed to sync projects:', error)
  }
}

function getOfflineActions(type) {
  // Implement getting offline actions from storage
  // This would typically use IndexedDB
  return []
}

function removeOfflineAction(type, id) {
  // Implement removing offline action from storage
  console.log(`Removing offline action ${id} for ${type}`)
}

// Message handling for communication with the main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received', event.data)
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  
  if (event.data && event.data.type === 'CACHE_UPDATE') {
    // Handle cache updates from the main thread
    updateCache(event.data.urls)
  }
})

async function updateCache(urls) {
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.addAll(urls)
    console.log('Service Worker: Cache updated with new URLs')
  } catch (error) {
    console.error('Service Worker: Failed to update cache', error)
  }
}