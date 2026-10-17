<template>
  <aside class="w-64 bg-white shadow-sm border-r border-gray-200 flex flex-col">
    <!-- Logo and brand -->
    <div class="p-6 border-b border-gray-200">
      <NuxtLink to="/" class="flex items-center space-x-2">
        <div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
          <span class="text-white font-bold text-sm">SC</span>
        </div>
        <span class="text-xl font-bold text-gray-900">SocialConnect</span>
      </NuxtLink>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 px-4 py-6 space-y-2">
      <NuxtLink
        v-for="item in navigationItems"
        :key="item.name"
        :to="item.href"
        class="nav-link"
        :class="$route.path === item.href ? 'nav-link-active' : 'nav-link-inactive'"
        @click="$emit('close')"
      >
        <component :is="item.icon" class="w-5 h-5 mr-3" />
        <span>{{ item.name }}</span>
        <span
          v-if="item.badge"
          class="ml-auto bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center"
        >
          {{ item.badge }}
        </span>
      </NuxtLink>
    </nav>

    <!-- User profile section -->
    <div class="p-4 border-t border-gray-200">
      <div class="flex items-center space-x-3">
        <img
          :src="user?.avatar || '/default-avatar.png'"
          :alt="user?.displayName || user?.username"
          class="w-10 h-10 rounded-full object-cover"
        />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-900 truncate">
            {{ user?.displayName || user?.username }}
          </p>
          <p class="text-xs text-gray-500 truncate">
            @{{ user?.username }}
          </p>
        </div>
        <Menu as="div" class="relative">
          <MenuButton class="p-1 text-gray-400 hover:text-gray-600">
            <EllipsisHorizontalIcon class="w-5 h-5" />
          </MenuButton>
          <Transition
            enter-active-class="transition duration-100 ease-out"
            enter-from-class="transform scale-95 opacity-0"
            enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75 ease-in"
            leave-from-class="transform scale-100 opacity-100"
            leave-to-class="transform scale-95 opacity-0"
          >
            <MenuItems class="absolute bottom-full right-0 mb-2 w-48 origin-bottom-right bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
              <div class="py-1">
                <MenuItem v-slot="{ active }">
                  <NuxtLink
                    :to="`/profile/${user?.username}`"
                    :class="[
                      active ? 'bg-gray-100' : '',
                      'block px-4 py-2 text-sm text-gray-700'
                    ]"
                  >
                    View Profile
                  </NuxtLink>
                </MenuItem>
                <MenuItem v-slot="{ active }">
                  <NuxtLink
                    to="/settings"
                    :class="[
                      active ? 'bg-gray-100' : '',
                      'block px-4 py-2 text-sm text-gray-700'
                    ]"
                  >
                    Settings
                  </NuxtLink>
                </MenuItem>
                <MenuItem v-slot="{ active }">
                  <button
                    @click="logout"
                    :class="[
                      active ? 'bg-gray-100' : '',
                      'block w-full text-left px-4 py-2 text-sm text-gray-700'
                    ]"
                  >
                    Sign out
                  </button>
                </MenuItem>
              </div>
            </MenuItems>
          </Transition>
        </Menu>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/vue'
import {
  HomeIcon,
  MagnifyingGlassIcon,
  BellIcon,
  EnvelopeIcon,
  BookmarkIcon,
  UserIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon
} from '@heroicons/vue/24/outline'

const emit = defineEmits(['close'])

const authStore = useAuthStore()
const messagingStore = useMessagingStore()

const user = computed(() => authStore.currentUser)
const unreadMessages = computed(() => messagingStore.totalUnreadCount)

const navigationItems = computed(() => [
  {
    name: 'Home',
    href: '/',
    icon: HomeIcon
  },
  {
    name: 'Explore',
    href: '/explore',
    icon: MagnifyingGlassIcon
  },
  {
    name: 'Notifications',
    href: '/notifications',
    icon: BellIcon,
    badge: 0 // TODO: Implement notifications count
  },
  {
    name: 'Messages',
    href: '/messages',
    icon: EnvelopeIcon,
    badge: unreadMessages.value || null
  },
  {
    name: 'Bookmarks',
    href: '/bookmarks',
    icon: BookmarkIcon
  },
  {
    name: 'Profile',
    href: `/profile/${user.value?.username}`,
    icon: UserIcon
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Cog6ToothIcon
  }
])

const logout = async () => {
  try {
    await authStore.logout()
    emit('close')
  } catch (error) {
    console.error('Logout error:', error)
  }
}
</script>