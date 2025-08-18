<template>
  <header class="fixed top-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center justify-between h-16 px-4 lg:px-6">
      <!-- Mobile menu button and logo -->
      <div class="flex items-center">
        <button
          v-if="isAuthenticated"
          @click="toggleMobileSidebar"
          class="lg:hidden p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md"
          aria-label="Toggle mobile menu"
        >
          <Icon name="heroicons:bars-3" class="h-6 w-6" />
        </button>

        <NuxtLink to="/" class="flex items-center ml-2 lg:ml-0">
          <Icon name="heroicons:squares-2x2-solid" class="h-8 w-8 text-primary-600" />
          <span class="ml-2 text-xl font-bold text-gray-900 dark:text-white">
            Vue PM
          </span>
        </NuxtLink>
      </div>

      <!-- Search bar (desktop) -->
      <div v-if="isAuthenticated" class="hidden md:flex flex-1 max-w-lg mx-8">
        <div class="relative w-full">
          <Icon name="heroicons:magnifying-glass" class="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search projects, tasks, people..."
            class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            @keydown.enter="handleSearch"
            @keydown.cmd.k.prevent="openCommandPalette"
            @keydown.ctrl.k.prevent="openCommandPalette"
          />
          <kbd class="absolute right-3 top-1/2 transform -translate-y-1/2 hidden lg:inline-flex items-center px-2 py-1 text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 rounded">
            ⌘K
          </kbd>
        </div>
      </div>

      <!-- Right side actions -->
      <div class="flex items-center space-x-2">
        <!-- Search button (mobile) -->
        <button
          v-if="isAuthenticated"
          @click="openCommandPalette"
          class="md:hidden p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md"
          aria-label="Search"
        >
          <Icon name="heroicons:magnifying-glass" class="h-6 w-6" />
        </button>

        <!-- Quick actions -->
        <div v-if="isAuthenticated" class="hidden sm:flex items-center space-x-1">
          <UTooltip text="Create Task">
            <button
              @click="openTaskModal"
              class="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Create task"
            >
              <Icon name="heroicons:plus" class="h-5 w-5" />
            </button>
          </UTooltip>

          <UTooltip text="Notifications">
            <button
              @click="toggleNotifications"
              class="relative p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Notifications"
            >
              <Icon name="heroicons:bell" class="h-5 w-5" />
              <span
                v-if="unreadCount > 0"
                class="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center"
              >
                {{ unreadCount > 9 ? '9+' : unreadCount }}
              </span>
            </button>
          </UTooltip>
        </div>

        <!-- Theme toggle -->
        <ThemeToggle />

        <!-- User menu -->
        <div v-if="isAuthenticated" class="relative">
          <UDropdown :items="userMenuItems" :popper="{ placement: 'bottom-end' }">
            <button class="flex items-center p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
              <img
                :src="user?.avatar || '/default-avatar.png'"
                :alt="user?.name"
                class="h-8 w-8 rounded-full object-cover"
              />
            </button>
          </UDropdown>
        </div>

        <!-- Login button for unauthenticated users -->
        <div v-else class="flex items-center space-x-2">
          <NuxtLink
            to="/auth/login"
            class="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium"
          >
            Sign In
          </NuxtLink>
          <NuxtLink
            to="/auth/register"
            class="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Sign Up
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Notifications panel -->
    <NotificationsPanel
      v-if="showNotifications"
      @close="closeNotifications"
    />
  </header>
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
const { user, isAuthenticated } = storeToRefs(authStore)
const { unreadCount } = storeToRefs(notificationStore)

const searchQuery = ref('')
const showNotifications = ref(false)

// User menu items
const userMenuItems = computed(() => [
  [{
    label: user.value?.name || 'User',
    slot: 'account',
    disabled: true
  }],
  [{
    label: 'Dashboard',
    icon: 'heroicons:home',
    to: '/dashboard'
  }, {
    label: 'My Tasks',
    icon: 'heroicons:clipboard-document-list',
    to: '/tasks'
  }, {
    label: 'Projects',
    icon: 'heroicons:folder',
    to: '/projects'
  }],
  [{
    label: 'Profile',
    icon: 'heroicons:user',
    to: '/profile'
  }, {
    label: 'Settings',
    icon: 'heroicons:cog-6-tooth',
    to: '/settings'
  }],
  [{
    label: 'Sign out',
    icon: 'heroicons:arrow-right-on-rectangle',
    click: () => authStore.logout()
  }]
])

// Methods
const toggleMobileSidebar = () => {
  uiStore.toggleMobileSidebar()
}

const handleSearch = () => {
  if (searchQuery.value.trim()) {
    navigateTo(`/search?q=${encodeURIComponent(searchQuery.value)}`)
  }
}

const openCommandPalette = () => {
  uiStore.setCommandPaletteOpen(true)
}

const openTaskModal = () => {
  uiStore.openTaskModal('create')
}

const toggleNotifications = () => {
  showNotifications.value = !showNotifications.value
}

const closeNotifications = () => {
  showNotifications.value = false
}

// Close notifications when clicking outside
onClickOutside(showNotifications, () => {
  showNotifications.value = false
})
</script>

<template #account="{ item }">
  <div class="flex items-center gap-2 p-2">
    <img
      :src="user?.avatar || '/default-avatar.png'"
      :alt="user?.name"
      class="h-8 w-8 rounded-full"
    />
    <div class="flex flex-col">
      <span class="font-medium text-gray-900 dark:text-white">{{ user?.name }}</span>
      <span class="text-sm text-gray-500 dark:text-gray-400">{{ user?.email }}</span>
    </div>
  </div>
</template>