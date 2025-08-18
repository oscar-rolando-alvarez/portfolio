export const useKeyboardShortcuts = () => {
  const uiStore = useUIStore()
  const tasksStore = useTasksStore()
  const projectsStore = useProjectsStore()
  const router = useRouter()

  const shortcuts = [
    // Global shortcuts
    {
      key: 'cmd+k,ctrl+k',
      description: 'Open command palette',
      action: () => uiStore.setCommandPaletteOpen(true)
    },
    {
      key: 'cmd+shift+n,ctrl+shift+n',
      description: 'Create new task',
      action: () => uiStore.openTaskModal('create')
    },
    {
      key: 'cmd+shift+p,ctrl+shift+p',
      description: 'Create new project',
      action: () => uiStore.openProjectModal('create')
    },
    {
      key: 'cmd+shift+d,ctrl+shift+d',
      description: 'Go to dashboard',
      action: () => router.push('/dashboard')
    },
    {
      key: 'cmd+shift+t,ctrl+shift+t',
      description: 'Go to tasks',
      action: () => router.push('/tasks')
    },
    {
      key: 'cmd+shift+r,ctrl+shift+r',
      description: 'Go to projects',
      action: () => router.push('/projects')
    },
    {
      key: 'cmd+shift+c,ctrl+shift+c',
      description: 'Go to calendar',
      action: () => router.push('/calendar')
    },
    {
      key: 'cmd+shift+s,ctrl+shift+s',
      description: 'Go to settings',
      action: () => router.push('/settings')
    },
    {
      key: 'escape',
      description: 'Close modals',
      action: () => uiStore.closeAllModals()
    },
    // Task view shortcuts
    {
      key: '1',
      description: 'Switch to kanban view',
      action: () => tasksStore.setViewMode('kanban'),
      scope: 'tasks'
    },
    {
      key: '2',
      description: 'Switch to list view',
      action: () => tasksStore.setViewMode('list'),
      scope: 'tasks'
    },
    {
      key: '3',
      description: 'Switch to calendar view',
      action: () => tasksStore.setViewMode('calendar'),
      scope: 'tasks'
    },
    {
      key: '4',
      description: 'Switch to gantt view',
      action: () => tasksStore.setViewMode('gantt'),
      scope: 'tasks'
    },
    // Quick filters
    {
      key: 'f',
      description: 'Focus search',
      action: () => {
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
        searchInput?.focus()
      }
    },
    {
      key: 'cmd+f,ctrl+f',
      description: 'Open search',
      action: () => {
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
        searchInput?.focus()
      }
    }
  ]

  const handleKeydown = (event: KeyboardEvent) => {
    // Don't handle shortcuts when typing in input fields
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
      // Allow escape to blur input fields
      if (event.key === 'Escape') {
        target.blur()
        return
      }
      return
    }

    // Check if any modal is open
    if (uiStore.isAnyModalOpen && event.key !== 'Escape') {
      return
    }

    // Get current route for scoped shortcuts
    const route = useRoute()
    const currentScope = route.path.split('/')[1] // e.g., 'tasks', 'projects'

    for (const shortcut of shortcuts) {
      if (shortcut.scope && shortcut.scope !== currentScope) {
        continue
      }

      const keys = shortcut.key.split(',')
      const matched = keys.some(key => {
        const keyParts = key.split('+')
        const requiredKey = keyParts[keyParts.length - 1]
        
        // Check if the pressed key matches
        if (event.key.toLowerCase() !== requiredKey.toLowerCase()) {
          return false
        }

        // Check modifiers
        const needsCmd = keyParts.includes('cmd')
        const needsCtrl = keyParts.includes('ctrl')
        const needsShift = keyParts.includes('shift')
        const needsAlt = keyParts.includes('alt')

        // Handle cmd vs ctrl for cross-platform compatibility
        const hasModifierKey = needsCmd ? event.metaKey : needsCtrl ? event.ctrlKey : true

        return (
          (!needsCmd && !needsCtrl || hasModifierKey) &&
          (!needsShift || event.shiftKey) &&
          (!needsAlt || event.altKey)
        )
      })

      if (matched) {
        event.preventDefault()
        event.stopPropagation()
        shortcut.action()
        break
      }
    }
  }

  // Register keyboard shortcuts
  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  // Cleanup
  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })

  return {
    shortcuts: shortcuts.map(s => ({
      key: s.key,
      description: s.description,
      scope: s.scope
    }))
  }
}