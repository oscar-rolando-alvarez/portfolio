import { defineStore } from 'pinia'
import type { Notification, NotificationType } from '~/types'

interface NotificationsState {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  error: string | null
  realTimeEnabled: boolean
  filters: {
    type: NotificationType[]
    isRead: boolean | null
  }
  settings: {
    emailNotifications: boolean
    browserNotifications: boolean
    taskAssigned: boolean
    taskDue: boolean
    projectUpdates: boolean
    mentions: boolean
  }
}

export const useNotificationStore = defineStore('notifications', {
  state: (): NotificationsState => ({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    error: null,
    realTimeEnabled: false,
    filters: {
      type: [],
      isRead: null
    },
    settings: {
      emailNotifications: true,
      browserNotifications: true,
      taskAssigned: true,
      taskDue: true,
      projectUpdates: true,
      mentions: true
    }
  }),

  getters: {
    unreadNotifications: (state) => {
      return state.notifications.filter(n => !n.isRead)
    },

    filteredNotifications: (state) => {
      let filtered = [...state.notifications]

      // Apply type filter
      if (state.filters.type.length > 0) {
        filtered = filtered.filter(n => state.filters.type.includes(n.type))
      }

      // Apply read status filter
      if (state.filters.isRead !== null) {
        filtered = filtered.filter(n => n.isRead === state.filters.isRead)
      }

      // Sort by creation date (newest first)
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      return filtered
    },

    notificationsByType: (state) => {
      const grouped: Record<NotificationType, Notification[]> = {
        [NotificationType.TASK_ASSIGNED]: [],
        [NotificationType.TASK_DUE]: [],
        [NotificationType.TASK_OVERDUE]: [],
        [NotificationType.COMMENT_MENTION]: [],
        [NotificationType.PROJECT_INVITE]: [],
        [NotificationType.DEADLINE_REMINDER]: []
      }

      state.notifications.forEach(notification => {
        if (grouped[notification.type]) {
          grouped[notification.type].push(notification)
        }
      })

      return grouped
    },

    recentNotifications: (state) => {
      return state.notifications
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10)
    }
  },

  actions: {
    async fetchNotifications() {
      this.isLoading = true
      this.error = null

      try {
        const { data } = await $fetch<{ notifications: Notification[]; unreadCount: number }>('/api/notifications')
        this.notifications = data.notifications
        this.unreadCount = data.unreadCount
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to fetch notifications'
        console.error('Fetch notifications error:', error)
      } finally {
        this.isLoading = false
      }
    },

    async markAsRead(notificationId: string) {
      try {
        await $fetch(`/api/notifications/${notificationId}/read`, {
          method: 'PUT'
        })

        // Update local state
        const notification = this.notifications.find(n => n.id === notificationId)
        if (notification && !notification.isRead) {
          notification.isRead = true
          this.unreadCount = Math.max(0, this.unreadCount - 1)
        }
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to mark notification as read'
        console.error('Mark notification as read error:', error)
      }
    },

    async markAllAsRead() {
      try {
        await $fetch('/api/notifications/read-all', {
          method: 'PUT'
        })

        // Update local state
        this.notifications.forEach(notification => {
          notification.isRead = true
        })
        this.unreadCount = 0
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to mark all notifications as read'
        console.error('Mark all notifications as read error:', error)
      }
    },

    async deleteNotification(notificationId: string) {
      try {
        await $fetch(`/api/notifications/${notificationId}`, {
          method: 'DELETE'
        })

        // Update local state
        const notification = this.notifications.find(n => n.id === notificationId)
        if (notification && !notification.isRead) {
          this.unreadCount = Math.max(0, this.unreadCount - 1)
        }

        this.notifications = this.notifications.filter(n => n.id !== notificationId)
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to delete notification'
        console.error('Delete notification error:', error)
      }
    },

    async clearAllNotifications() {
      try {
        await $fetch('/api/notifications', {
          method: 'DELETE'
        })

        // Clear local state
        this.notifications = []
        this.unreadCount = 0
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to clear notifications'
        console.error('Clear notifications error:', error)
      }
    },

    async updateSettings(settings: Partial<NotificationsState['settings']>) {
      try {
        await $fetch('/api/notifications/settings', {
          method: 'PUT',
          body: settings
        })

        // Update local state
        this.settings = { ...this.settings, ...settings }
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to update notification settings'
        console.error('Update notification settings error:', error)
      }
    },

    addNotification(notification: Notification) {
      // Add new notification to the beginning of the list
      this.notifications.unshift(notification)

      // Update unread count if the notification is unread
      if (!notification.isRead) {
        this.unreadCount++
      }

      // Show browser notification if enabled
      if (this.settings.browserNotifications && this.shouldShowBrowserNotification(notification.type)) {
        this.showBrowserNotification(notification)
      }

      // Limit the number of stored notifications
      if (this.notifications.length > 100) {
        this.notifications = this.notifications.slice(0, 100)
      }
    },

    shouldShowBrowserNotification(type: NotificationType): boolean {
      switch (type) {
        case NotificationType.TASK_ASSIGNED:
          return this.settings.taskAssigned
        case NotificationType.TASK_DUE:
        case NotificationType.TASK_OVERDUE:
          return this.settings.taskDue
        case NotificationType.COMMENT_MENTION:
          return this.settings.mentions
        case NotificationType.PROJECT_INVITE:
          return this.settings.projectUpdates
        case NotificationType.DEADLINE_REMINDER:
          return this.settings.taskDue
        default:
          return false
      }
    },

    showBrowserNotification(notification: Notification) {
      if (process.client && 'Notification' in window && Notification.permission === 'granted') {
        const browserNotification = new Notification(notification.title, {
          body: notification.message,
          icon: '/icon-192x192.png',
          badge: '/icon-96x96.png',
          tag: notification.id,
          requireInteraction: false,
          silent: false
        })

        // Auto close after 5 seconds
        setTimeout(() => {
          browserNotification.close()
        }, 5000)

        // Handle notification click
        browserNotification.onclick = () => {
          window.focus()
          // Navigate to relevant page based on notification data
          if (notification.data?.taskId) {
            navigateTo(`/tasks/${notification.data.taskId}`)
          } else if (notification.data?.projectId) {
            navigateTo(`/projects/${notification.data.projectId}`)
          }
          browserNotification.close()
        }
      }
    },

    setFilters(filters: Partial<NotificationsState['filters']>) {
      this.filters = { ...this.filters, ...filters }
    },

    clearFilters() {
      this.filters = {
        type: [],
        isRead: null
      }
    },

    enableRealTime() {
      this.realTimeEnabled = true
    },

    disableRealTime() {
      this.realTimeEnabled = false
    },

    // Initialize notifications
    async initializeNotifications() {
      await this.fetchNotifications()
      this.enableRealTime()
    },

    clearError() {
      this.error = null
    }
  }
})