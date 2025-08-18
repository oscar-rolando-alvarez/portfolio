import { io, Socket } from 'socket.io-client'
import type { WebSocketMessage } from '~/types'

interface UseWebSocketReturn {
  socket: Ref<Socket | null>
  isConnected: Ref<boolean>
  connect: () => Promise<void>
  disconnect: () => void
  emit: (event: string, data: any) => void
  on: (event: string, callback: (data: any) => void) => void
  off: (event: string, callback?: (data: any) => void) => void
}

export const useWebSocket = (): UseWebSocketReturn => {
  const socket = ref<Socket | null>(null)
  const isConnected = ref(false)
  
  const config = useRuntimeConfig()
  const authStore = useAuthStore()
  const notificationStore = useNotificationStore()

  const connect = async (): Promise<void> => {
    if (socket.value?.connected) {
      return
    }

    try {
      socket.value = io(config.public.wsUrl, {
        auth: {
          token: authStore.token
        },
        autoConnect: false
      })

      // Connection event handlers
      socket.value.on('connect', () => {
        isConnected.value = true
        console.log('WebSocket connected')
        
        // Join user-specific room
        if (authStore.user?.id) {
          socket.value?.emit('join-user-room', authStore.user.id)
        }
      })

      socket.value.on('disconnect', () => {
        isConnected.value = false
        console.log('WebSocket disconnected')
      })

      socket.value.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error)
        isConnected.value = false
      })

      // Real-time event handlers
      socket.value.on('task-updated', (data) => {
        console.log('Task updated:', data)
        // Update task in store
        const tasksStore = useTasksStore()
        tasksStore.handleTaskUpdate(data.task)
      })

      socket.value.on('project-updated', (data) => {
        console.log('Project updated:', data)
        // Update project in store
        const projectsStore = useProjectsStore()
        projectsStore.handleProjectUpdate(data.project)
      })

      socket.value.on('notification', (notification) => {
        console.log('New notification:', notification)
        // Add notification to store
        notificationStore.addNotification(notification)
      })

      socket.value.on('user-typing', (data) => {
        console.log('User typing:', data)
        // Handle typing indicators
      })

      socket.value.on('user-online', (data) => {
        console.log('User online:', data)
        // Update user online status
      })

      socket.value.on('user-offline', (data) => {
        console.log('User offline:', data)
        // Update user offline status
      })

      // Connect to the server
      socket.value.connect()
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error)
    }
  }

  const disconnect = (): void => {
    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
      isConnected.value = false
    }
  }

  const emit = (event: string, data: any): void => {
    if (socket.value?.connected) {
      socket.value.emit(event, data)
    } else {
      console.warn('WebSocket not connected, cannot emit event:', event)
    }
  }

  const on = (event: string, callback: (data: any) => void): void => {
    socket.value?.on(event, callback)
  }

  const off = (event: string, callback?: (data: any) => void): void => {
    if (callback) {
      socket.value?.off(event, callback)
    } else {
      socket.value?.off(event)
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    disconnect()
  })

  return {
    socket,
    isConnected,
    connect,
    disconnect,
    emit,
    on,
    off
  }
}