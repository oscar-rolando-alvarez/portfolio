<template>
  <div class="min-h-screen bg-surface">
    <!-- Skip to content link for accessibility -->
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-primary text-white px-4 py-2 rounded-md z-50"
    >
      Skip to main content
    </a>

    <!-- Header Navigation -->
    <AppHeader v-if="!isAuthPage" />

    <!-- Sidebar Navigation -->
    <AppSidebar v-if="!isAuthPage && isAuthenticated" :is-mobile-open="isMobileSidebarOpen" @close="closeMobileSidebar" />

    <!-- Main Content Area -->
    <main
      id="main-content"
      :class="[
        'transition-all duration-300',
        !isAuthPage && isAuthenticated ? 'lg:ml-64' : '',
        !isAuthPage ? 'pt-16' : ''
      ]"
    >
      <div v-if="!isAuthPage" class="p-4 lg:p-6">
        <!-- Breadcrumb Navigation -->
        <AppBreadcrumb v-if="showBreadcrumb" class="mb-4" />
        
        <!-- Page Content -->
        <slot />
      </div>
      
      <!-- Auth pages without padding -->
      <slot v-else />
    </main>

    <!-- Command Palette -->
    <CommandPalette />

    <!-- Global Modals -->
    <TaskModal />
    <ProjectModal />
    <UserInviteModal />

    <!-- Notification Toasts -->
    <UNotifications />

    <!-- Loading Overlay -->
    <LoadingOverlay v-if="isLoading" />
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useUIStore } from '~/stores/ui'
import { useNotificationStore } from '~/stores/notifications'

// Stores
const authStore = useAuthStore()
const uiStore = useUIStore()
const notificationStore = useNotificationStore()

// Reactive state
const { isAuthenticated } = storeToRefs(authStore)
const { isMobileSidebarOpen, isLoading } = storeToRefs(uiStore)

// Computed properties
const route = useRoute()

const isAuthPage = computed(() => {
  return route.path.startsWith('/auth') || route.path === '/login' || route.path === '/register'
})

const showBreadcrumb = computed(() => {
  return !isAuthPage.value && route.path !== '/' && route.path !== '/dashboard'
})

// Methods
const closeMobileSidebar = () => {
  uiStore.setMobileSidebarOpen(false)
}

// Initialize app on mount
onMounted(async () => {
  // Check authentication status
  await authStore.checkAuth()
  
  // Initialize notifications if authenticated
  if (isAuthenticated.value) {
    await notificationStore.initializeNotifications()
  }
  
  // Initialize websocket connection
  if (isAuthenticated.value) {
    // WebSocket initialization will be handled in the websocket composable
    await useWebSocket().connect()
  }
})

// Handle route changes
watch(() => route.path, () => {
  // Close mobile sidebar on route change
  if (isMobileSidebarOpen.value) {
    closeMobileSidebar()
  }
  
  // Reset loading state
  uiStore.setLoading(false)
})

// Handle window resize
const { width } = useWindowSize()
watch(width, (newWidth) => {
  if (newWidth >= 1024 && isMobileSidebarOpen.value) {
    closeMobileSidebar()
  }
})

// Keyboard shortcuts
useKeyboardShortcuts()

// Page title management
useHead({
  titleTemplate: (title?: string) => {
    if (title) {
      return `${title} - Vue Project Management`
    }
    return 'Vue Project Management'
  }
})
</script>

<style scoped>
/* Component-specific styles */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}

.slide-enter-from {
  transform: translateX(-100%);
}

.slide-leave-to {
  transform: translateX(-100%);
}
</style>