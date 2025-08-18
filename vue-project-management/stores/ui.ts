import { defineStore } from 'pinia'

interface UIState {
  isMobileSidebarOpen: boolean
  isLoading: boolean
  loadingMessage: string
  commandPaletteOpen: boolean
  modals: {
    taskModal: {
      isOpen: boolean
      taskId?: string
      mode: 'create' | 'edit' | 'view'
    }
    projectModal: {
      isOpen: boolean
      projectId?: string
      mode: 'create' | 'edit' | 'view'
    }
    userInviteModal: {
      isOpen: boolean
      projectId?: string
    }
    confirmDialog: {
      isOpen: boolean
      title: string
      message: string
      confirmText: string
      cancelText: string
      onConfirm?: () => void | Promise<void>
      onCancel?: () => void
      variant: 'danger' | 'warning' | 'info'
    }
  }
  notifications: {
    isEnabled: boolean
    permission: NotificationPermission
  }
  shortcuts: {
    isEnabled: boolean
  }
  layout: {
    sidebarCollapsed: boolean
    contentWidth: 'full' | 'contained'
  }
}

export const useUIStore = defineStore('ui', {
  state: (): UIState => ({
    isMobileSidebarOpen: false,
    isLoading: false,
    loadingMessage: '',
    commandPaletteOpen: false,
    modals: {
      taskModal: {
        isOpen: false,
        mode: 'create'
      },
      projectModal: {
        isOpen: false,
        mode: 'create'
      },
      userInviteModal: {
        isOpen: false
      },
      confirmDialog: {
        isOpen: false,
        title: '',
        message: '',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        variant: 'info'
      }
    },
    notifications: {
      isEnabled: false,
      permission: 'default'
    },
    shortcuts: {
      isEnabled: true
    },
    layout: {
      sidebarCollapsed: false,
      contentWidth: 'contained'
    }
  }),

  getters: {
    isAnyModalOpen: (state) => {
      return Object.values(state.modals).some(modal => modal.isOpen)
    }
  },

  actions: {
    // Mobile sidebar
    setMobileSidebarOpen(isOpen: boolean) {
      this.isMobileSidebarOpen = isOpen
    },

    toggleMobileSidebar() {
      this.isMobileSidebarOpen = !this.isMobileSidebarOpen
    },

    // Global loading
    setLoading(isLoading: boolean, message = '') {
      this.isLoading = isLoading
      this.loadingMessage = message
    },

    // Command palette
    setCommandPaletteOpen(isOpen: boolean) {
      this.commandPaletteOpen = isOpen
    },

    toggleCommandPalette() {
      this.commandPaletteOpen = !this.commandPaletteOpen
    },

    // Task modal
    openTaskModal(mode: 'create' | 'edit' | 'view' = 'create', taskId?: string) {
      this.modals.taskModal = {
        isOpen: true,
        mode,
        taskId
      }
    },

    closeTaskModal() {
      this.modals.taskModal = {
        isOpen: false,
        mode: 'create'
      }
    },

    // Project modal
    openProjectModal(mode: 'create' | 'edit' | 'view' = 'create', projectId?: string) {
      this.modals.projectModal = {
        isOpen: true,
        mode,
        projectId
      }
    },

    closeProjectModal() {
      this.modals.projectModal = {
        isOpen: false,
        mode: 'create'
      }
    },

    // User invite modal
    openUserInviteModal(projectId?: string) {
      this.modals.userInviteModal = {
        isOpen: true,
        projectId
      }
    },

    closeUserInviteModal() {
      this.modals.userInviteModal = {
        isOpen: false
      }
    },

    // Confirm dialog
    openConfirmDialog(options: {
      title: string
      message: string
      confirmText?: string
      cancelText?: string
      variant?: 'danger' | 'warning' | 'info'
      onConfirm?: () => void | Promise<void>
      onCancel?: () => void
    }) {
      this.modals.confirmDialog = {
        isOpen: true,
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        variant: options.variant || 'info',
        onConfirm: options.onConfirm,
        onCancel: options.onCancel
      }
    },

    closeConfirmDialog() {
      this.modals.confirmDialog = {
        isOpen: false,
        title: '',
        message: '',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        variant: 'info'
      }
    },

    // Close all modals
    closeAllModals() {
      this.closeTaskModal()
      this.closeProjectModal()
      this.closeUserInviteModal()
      this.closeConfirmDialog()
      this.setCommandPaletteOpen(false)
    },

    // Notifications
    async requestNotificationPermission() {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission()
        this.notifications.permission = permission
        this.notifications.isEnabled = permission === 'granted'
        return permission
      }
      return 'denied'
    },

    checkNotificationPermission() {
      if ('Notification' in window) {
        this.notifications.permission = Notification.permission
        this.notifications.isEnabled = Notification.permission === 'granted'
      }
    },

    // Shortcuts
    setShortcutsEnabled(enabled: boolean) {
      this.shortcuts.isEnabled = enabled
      this.saveUIPreferences()
    },

    // Layout
    setSidebarCollapsed(collapsed: boolean) {
      this.layout.sidebarCollapsed = collapsed
      this.saveUIPreferences()
    },

    toggleSidebarCollapsed() {
      this.layout.sidebarCollapsed = !this.layout.sidebarCollapsed
      this.saveUIPreferences()
    },

    setContentWidth(width: 'full' | 'contained') {
      this.layout.contentWidth = width
      this.saveUIPreferences()
    },

    // Persistence
    saveUIPreferences() {
      if (process.client) {
        const preferences = {
          shortcuts: this.shortcuts,
          layout: this.layout
        }
        localStorage.setItem('ui-preferences', JSON.stringify(preferences))
      }
    },

    loadUIPreferences() {
      if (process.client) {
        try {
          const saved = localStorage.getItem('ui-preferences')
          if (saved) {
            const preferences = JSON.parse(saved)
            if (preferences.shortcuts) {
              this.shortcuts = preferences.shortcuts
            }
            if (preferences.layout) {
              this.layout = preferences.layout
            }
          }
        } catch (error) {
          console.warn('Failed to load UI preferences:', error)
        }
      }
    },

    // Initialize UI store
    initialize() {
      this.loadUIPreferences()
      this.checkNotificationPermission()
    }
  }
})