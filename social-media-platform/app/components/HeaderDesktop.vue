<template>
  <header class="bg-white border-b border-gray-200 px-6 py-4">
    <div class="flex items-center justify-between">
      <!-- Search bar -->
      <div class="flex-1 max-w-lg">
        <div class="relative">
          <MagnifyingGlassIcon class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search posts, people, hashtags..."
            class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            @focus="showSearchDropdown = true"
            @blur="hideSearchDropdown"
          />
          
          <!-- Search dropdown -->
          <div
            v-if="showSearchDropdown && (searchResults.length > 0 || searchQuery.length > 0)"
            class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto"
          >
            <div v-if="isSearching" class="p-4 text-center">
              <div class="loading-spinner mx-auto"></div>
              <p class="text-sm text-gray-500 mt-2">Searching...</p>
            </div>
            
            <div v-else-if="searchResults.length === 0 && searchQuery.length > 0" class="p-4 text-center">
              <p class="text-sm text-gray-500">No results found</p>
            </div>
            
            <div v-else>
              <!-- Users -->
              <div v-if="searchResults.users?.length > 0">
                <h3 class="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                  People
                </h3>
                <NuxtLink
                  v-for="user in searchResults.users"
                  :key="user.id"
                  :to="`/profile/${user.username}`"
                  class="flex items-center px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  @click="hideSearchDropdown"
                >
                  <img
                    :src="user.avatar || '/default-avatar.png'"
                    :alt="user.displayName || user.username"
                    class="w-8 h-8 rounded-full object-cover"
                  />
                  <div class="ml-3">
                    <p class="text-sm font-medium text-gray-900">
                      {{ user.displayName || user.username }}
                    </p>
                    <p class="text-xs text-gray-500">@{{ user.username }}</p>
                  </div>
                  <CheckBadgeIcon v-if="user.verified" class="w-4 h-4 text-blue-500 ml-auto" />
                </NuxtLink>
              </div>

              <!-- Posts -->
              <div v-if="searchResults.posts?.length > 0">
                <h3 class="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                  Posts
                </h3>
                <NuxtLink
                  v-for="post in searchResults.posts"
                  :key="post.id"
                  :to="`/post/${post.id}`"
                  class="block px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  @click="hideSearchDropdown"
                >
                  <div class="flex items-start space-x-3">
                    <img
                      :src="post.author.avatar || '/default-avatar.png'"
                      :alt="post.author.displayName || post.author.username"
                      class="w-6 h-6 rounded-full object-cover"
                    />
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-gray-900 truncate">
                        {{ post.content }}
                      </p>
                      <p class="text-xs text-gray-500">
                        by @{{ post.author.username }}
                      </p>
                    </div>
                  </div>
                </NuxtLink>
              </div>

              <!-- Hashtags -->
              <div v-if="searchResults.hashtags?.length > 0">
                <h3 class="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                  Hashtags
                </h3>
                <NuxtLink
                  v-for="hashtag in searchResults.hashtags"
                  :key="hashtag"
                  :to="`/hashtag/${hashtag}`"
                  class="flex items-center px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  @click="hideSearchDropdown"
                >
                  <HashtagIcon class="w-5 h-5 text-gray-400 mr-3" />
                  <span class="text-sm text-gray-900">#{{ hashtag }}</span>
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center space-x-4 ml-6">
        <!-- New post button -->
        <button
          @click="showPostModal = true"
          class="btn-primary"
        >
          <PlusIcon class="w-4 h-4 mr-2" />
          New Post
        </button>

        <!-- Notifications -->
        <button
          @click="showNotifications = !showNotifications"
          class="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
        >
          <BellIcon class="w-6 h-6" />
          <span v-if="unreadNotifications > 0" class="notification-badge">
            {{ unreadNotifications > 99 ? '99+' : unreadNotifications }}
          </span>
        </button>

        <!-- Messages -->
        <NuxtLink
          to="/messages"
          class="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
        >
          <EnvelopeIcon class="w-6 h-6" />
          <span v-if="unreadMessages > 0" class="notification-badge">
            {{ unreadMessages > 99 ? '99+' : unreadMessages }}
          </span>
        </NuxtLink>
      </div>
    </div>

    <!-- Post modal -->
    <PostModal v-model="showPostModal" />

    <!-- Notifications dropdown -->
    <NotificationsDropdown v-model="showNotifications" />
  </header>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  BellIcon,
  EnvelopeIcon,
  CheckBadgeIcon,
  HashtagIcon
} from '@heroicons/vue/24/outline'

const searchQuery = ref('')
const searchResults = ref({ users: [], posts: [], hashtags: [] })
const isSearching = ref(false)
const showSearchDropdown = ref(false)
const showPostModal = ref(false)
const showNotifications = ref(false)

const messagingStore = useMessagingStore()
const unreadMessages = computed(() => messagingStore.totalUnreadCount)
const unreadNotifications = ref(0) // TODO: Implement notifications store

// Search functionality
const searchTimeout = ref(null)

watch(searchQuery, (newQuery) => {
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value)
  }

  if (newQuery.length < 2) {
    searchResults.value = { users: [], posts: [], hashtags: [] }
    return
  }

  searchTimeout.value = setTimeout(async () => {
    await performSearch(newQuery)
  }, 300)
})

const performSearch = async (query) => {
  if (!query || query.length < 2) return

  isSearching.value = true
  
  try {
    const authStore = useAuthStore()
    const { data } = await $fetch('/api/search', {
      query: { q: query },
      headers: {
        Authorization: `Bearer ${authStore.accessToken}`
      }
    })

    if (data) {
      searchResults.value = data
    }
  } catch (error) {
    console.error('Search error:', error)
  } finally {
    isSearching.value = false
  }
}

const hideSearchDropdown = () => {
  setTimeout(() => {
    showSearchDropdown.value = false
  }, 200)
}
</script>