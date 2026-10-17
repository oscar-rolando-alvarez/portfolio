<template>
  <div class="max-w-2xl mx-auto">
    <!-- Stories section -->
    <div class="mb-6">
      <StoriesCarousel />
    </div>

    <!-- Create post -->
    <div class="card mb-6">
      <CreatePostForm @post-created="handlePostCreated" />
    </div>

    <!-- Feed -->
    <div class="space-y-6">
      <!-- Loading skeleton -->
      <div v-if="isLoading && !posts.length" class="space-y-6">
        <PostSkeleton v-for="i in 3" :key="i" />
      </div>

      <!-- Posts -->
      <PostCard
        v-for="post in posts"
        :key="post.id"
        :post="post"
      />

      <!-- Load more button -->
      <div v-if="hasMore" class="text-center py-4">
        <button
          v-if="!isLoadingMore"
          @click="loadMore"
          class="btn-secondary"
        >
          Load More Posts
        </button>
        <div v-else class="flex items-center justify-center">
          <div class="loading-spinner"></div>
          <span class="ml-2 text-gray-600">Loading more posts...</span>
        </div>
      </div>

      <!-- No more posts -->
      <div v-else-if="posts.length > 0" class="text-center py-8">
        <p class="text-gray-500">You're all caught up!</p>
      </div>

      <!-- Empty state -->
      <div v-if="!isLoading && posts.length === 0" class="text-center py-12">
        <div class="max-w-sm mx-auto">
          <div class="w-24 h-24 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <UsersIcon class="w-12 h-12 text-gray-400" />
          </div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">
            Welcome to SocialConnect!
          </h3>
          <p class="text-gray-500 mb-6">
            Start following people to see their posts in your feed.
          </p>
          <NuxtLink to="/explore" class="btn-primary">
            Explore Users
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Infinite scroll trigger -->
    <div
      ref="infiniteScrollTrigger"
      class="h-1"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { UsersIcon } from '@heroicons/vue/24/outline'

// Meta
definePageMeta({
  middleware: 'auth'
})

useHead({
  title: 'Home - SocialConnect',
  meta: [
    {
      name: 'description',
      content: 'Stay connected with friends and discover amazing content on SocialConnect'
    }
  ]
})

// Stores
const postsStore = usePostsStore()
const storiesStore = useStoriesStore()

// Reactive data
const posts = computed(() => postsStore.feedPosts)
const isLoading = computed(() => postsStore.isLoading)
const isLoadingMore = computed(() => postsStore.isLoadingMore)
const hasMore = computed(() => postsStore.hasMore)

const infiniteScrollTrigger = ref(null)
const observer = ref(null)

// Methods
const loadFeed = async () => {
  try {
    await postsStore.fetchFeed(true) // Refresh feed
  } catch (error) {
    console.error('Error loading feed:', error)
    // TODO: Show error toast
  }
}

const loadMore = async () => {
  try {
    await postsStore.loadMorePosts()
  } catch (error) {
    console.error('Error loading more posts:', error)
    // TODO: Show error toast
  }
}

const handlePostCreated = (post) => {
  // Post is automatically added to store by CreatePostForm
  console.log('New post created:', post.id)
}

// Infinite scroll setup
const setupInfiniteScroll = () => {
  if (!infiniteScrollTrigger.value) return

  observer.value = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry.isIntersecting && hasMore.value && !isLoadingMore.value) {
        loadMore()
      }
    },
    {
      threshold: 0.1,
      rootMargin: '100px'
    }
  )

  observer.value.observe(infiniteScrollTrigger.value)
}

const cleanupInfiniteScroll = () => {
  if (observer.value) {
    observer.value.disconnect()
  }
}

// Lifecycle
onMounted(async () => {
  // Load initial data
  await Promise.all([
    loadFeed(),
    storiesStore.initializeStories()
  ])

  // Setup infinite scroll
  nextTick(() => {
    setupInfiniteScroll()
  })
})

onUnmounted(() => {
  cleanupInfiniteScroll()
})

// Auto-refresh feed periodically
let refreshInterval
onMounted(() => {
  // Refresh feed every 5 minutes
  refreshInterval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      loadFeed()
    }
  }, 5 * 60 * 1000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})

// Pull to refresh on mobile
const { y } = useWindowScroll()
const isRefreshing = ref(false)

watch(y, (newY, oldY) => {
  if (newY === 0 && oldY > 0 && !isRefreshing.value) {
    // User scrolled to top, could implement pull-to-refresh here
  }
})
</script>