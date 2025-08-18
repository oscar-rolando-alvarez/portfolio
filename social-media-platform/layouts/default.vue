<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Mobile header -->
    <HeaderMobile 
      v-if="isMobile" 
      @toggle-sidebar="sidebarOpen = !sidebarOpen"
    />
    
    <!-- Desktop layout -->
    <div class="flex h-screen">
      <!-- Sidebar -->
      <Transition
        enter-active-class="transition-transform duration-300"
        enter-from-class="-translate-x-full"
        enter-to-class="translate-x-0"
        leave-active-class="transition-transform duration-300"
        leave-from-class="translate-x-0"
        leave-to-class="-translate-x-full"
      >
        <Sidebar 
          v-if="!isMobile || sidebarOpen"
          class="fixed inset-y-0 left-0 z-50 md:relative md:z-auto"
          :class="{ 'md:translate-x-0': !isMobile }"
          @close="sidebarOpen = false"
        />
      </Transition>

      <!-- Mobile sidebar overlay -->
      <div
        v-if="isMobile && sidebarOpen"
        class="fixed inset-0 z-40 bg-black bg-opacity-50"
        @click="sidebarOpen = false"
      />

      <!-- Main content area -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Desktop header -->
        <HeaderDesktop v-if="!isMobile" />
        
        <!-- Page content -->
        <main class="flex-1 overflow-y-auto">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
            <slot />
          </div>
        </main>
      </div>

      <!-- Right sidebar (desktop only) -->
      <RightSidebar v-if="!isMobile && $route.name === 'index'" />
    </div>

    <!-- Mobile bottom navigation -->
    <BottomNavigation v-if="isMobile" />

    <!-- Global components -->
    <NotificationToast />
    <StoryViewer />
    <PostModal />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const sidebarOpen = ref(false)
const isMobile = ref(false)

const checkScreenSize = () => {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) {
    sidebarOpen.value = false
  }
}

onMounted(() => {
  checkScreenSize()
  window.addEventListener('resize', checkScreenSize)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkScreenSize)
})

// Initialize auth and messaging when layout mounts
const authStore = useAuthStore()
const messagingStore = useMessagingStore()

onMounted(async () => {
  await authStore.initializeAuth()
  
  if (authStore.isAuthenticated) {
    await messagingStore.initializeWebSocket()
  }
})

onUnmounted(() => {
  messagingStore.disconnectWebSocket()
})
</script>