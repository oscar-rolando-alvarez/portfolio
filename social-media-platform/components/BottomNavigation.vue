<template>
  <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-bottom z-40">
    <div class="flex justify-around py-2">
      <NuxtLink
        v-for="item in navigationItems"
        :key="item.name"
        :to="item.href"
        class="flex flex-col items-center py-2 px-3 relative"
        :class="$route.path === item.href ? 'text-primary-600' : 'text-gray-600'"
      >
        <component :is="item.icon" class="w-6 h-6" />
        <span class="text-xs mt-1 font-medium">{{ item.name }}</span>
        
        <!-- Badge for notifications and messages -->
        <span
          v-if="item.badge"
          class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none"
        >
          {{ item.badge > 99 ? '99+' : item.badge }}
        </span>
      </NuxtLink>
    </div>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import {
  HomeIcon,
  MagnifyingGlassIcon,
  PlusCircleIcon,
  BellIcon,
  UserIcon
} from '@heroicons/vue/24/outline'

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
    name: 'Create',
    href: '/create',
    icon: PlusCircleIcon
  },
  {
    name: 'Activity',
    href: '/notifications',
    icon: BellIcon,
    badge: 0 // TODO: Implement notifications count
  },
  {
    name: 'Profile',
    href: `/profile/${user.value?.username}`,
    icon: UserIcon
  }
])
</script>