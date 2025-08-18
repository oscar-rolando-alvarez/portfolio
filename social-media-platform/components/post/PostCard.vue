<template>
  <article class="card hover:shadow-md transition-shadow">
    <!-- Post header -->
    <div class="flex items-start justify-between mb-4">
      <div class="flex items-center space-x-3">
        <NuxtLink :to="`/profile/${post.author.username}`">
          <img
            :src="post.author.avatar || '/default-avatar.png'"
            :alt="post.author.displayName || post.author.username"
            class="w-10 h-10 rounded-full object-cover"
          />
        </NuxtLink>
        
        <div>
          <div class="flex items-center space-x-2">
            <NuxtLink
              :to="`/profile/${post.author.username}`"
              class="font-semibold text-gray-900 hover:text-primary-600"
            >
              {{ post.author.displayName || post.author.username }}
            </NuxtLink>
            <CheckBadgeIcon v-if="post.author.verified" class="w-4 h-4 text-blue-500" />
          </div>
          <div class="flex items-center space-x-2 text-sm text-gray-500">
            <span>@{{ post.author.username }}</span>
            <span>·</span>
            <time :datetime="post.createdAt" :title="formatDate(post.createdAt)">
              {{ formatTimeAgo(post.createdAt) }}
            </time>
            <PostVisibilityIcon :visibility="post.visibility" />
          </div>
        </div>
      </div>

      <!-- Post menu -->
      <Menu as="div" class="relative">
        <MenuButton class="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
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
          <MenuItems class="absolute right-0 mt-2 w-48 origin-top-right bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
            <div class="py-1">
              <MenuItem v-if="isOwnPost" v-slot="{ active }">
                <button
                  @click="deletePost"
                  :class="[
                    active ? 'bg-red-50 text-red-700' : 'text-red-600',
                    'group flex items-center px-4 py-2 text-sm w-full'
                  ]"
                >
                  <TrashIcon class="w-4 h-4 mr-3" />
                  Delete Post
                </button>
              </MenuItem>
              <MenuItem v-else v-slot="{ active }">
                <button
                  @click="reportPost"
                  :class="[
                    active ? 'bg-gray-100' : '',
                    'group flex items-center px-4 py-2 text-sm text-gray-700 w-full'
                  ]"
                >
                  <FlagIcon class="w-4 h-4 mr-3" />
                  Report Post
                </button>
              </MenuItem>
              <MenuItem v-slot="{ active }">
                <button
                  @click="copyLink"
                  :class="[
                    active ? 'bg-gray-100' : '',
                    'group flex items-center px-4 py-2 text-sm text-gray-700 w-full'
                  ]"
                >
                  <LinkIcon class="w-4 h-4 mr-3" />
                  Copy Link
                </button>
              </MenuItem>
            </div>
          </MenuItems>
        </Transition>
      </Menu>
    </div>

    <!-- Post content -->
    <div class="mb-4">
      <div v-if="post.content" class="post-content text-gray-900 mb-3">
        <p v-html="formatContent(post.content)"></p>
      </div>

      <!-- Media -->
      <PostMedia
        v-if="post.images.length > 0 || post.videos.length > 0"
        :images="post.images"
        :videos="post.videos"
        class="mb-3"
      />
    </div>

    <!-- Post stats -->
    <div class="flex items-center justify-between text-sm text-gray-500 mb-3 border-t border-gray-100 pt-3">
      <span>{{ post.views }} views</span>
      <div class="flex items-center space-x-4">
        <span>{{ post.likesCount }} likes</span>
        <span>{{ post.commentsCount }} comments</span>
        <span>{{ post.sharesCount }} shares</span>
      </div>
    </div>

    <!-- Post actions -->
    <div class="flex items-center justify-between border-t border-gray-100 pt-3">
      <div class="flex items-center space-x-1">
        <!-- Like button -->
        <button
          @click="toggleLike"
          :disabled="isLiking"
          class="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          :class="post.isLiked ? 'text-red-600' : 'text-gray-600'"
        >
          <HeartIcon
            :class="[
              'w-5 h-5',
              post.isLiked ? 'fill-current' : ''
            ]"
          />
          <span class="text-sm font-medium">{{ post.likesCount }}</span>
        </button>

        <!-- Comment button -->
        <button
          @click="toggleComments"
          class="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
        >
          <ChatBubbleOvalLeftIcon class="w-5 h-5" />
          <span class="text-sm font-medium">{{ post.commentsCount }}</span>
        </button>

        <!-- Share button -->
        <Menu as="div" class="relative">
          <MenuButton class="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
            <ShareIcon class="w-5 h-5" />
            <span class="text-sm font-medium">{{ post.sharesCount }}</span>
          </MenuButton>
          <Transition
            enter-active-class="transition duration-100 ease-out"
            enter-from-class="transform scale-95 opacity-0"
            enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75 ease-in"
            leave-from-class="transform scale-100 opacity-100"
            leave-to-class="transform scale-95 opacity-0"
          >
            <MenuItems class="absolute bottom-full left-0 mb-2 w-48 origin-bottom-left bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
              <div class="py-1">
                <MenuItem v-slot="{ active }">
                  <button
                    @click="sharePost('twitter')"
                    :class="[
                      active ? 'bg-gray-100' : '',
                      'group flex items-center px-4 py-2 text-sm text-gray-700 w-full'
                    ]"
                  >
                    Share to Twitter
                  </button>
                </MenuItem>
                <MenuItem v-slot="{ active }">
                  <button
                    @click="sharePost('facebook')"
                    :class="[
                      active ? 'bg-gray-100' : '',
                      'group flex items-center px-4 py-2 text-sm text-gray-700 w-full'
                    ]"
                  >
                    Share to Facebook
                  </button>
                </MenuItem>
                <MenuItem v-slot="{ active }">
                  <button
                    @click="sharePost('internal')"
                    :class="[
                      active ? 'bg-gray-100' : '',
                      'group flex items-center px-4 py-2 text-sm text-gray-700 w-full'
                    ]"
                  >
                    Share on SocialConnect
                  </button>
                </MenuItem>
              </div>
            </MenuItems>
          </Transition>
        </Menu>
      </div>

      <!-- Bookmark button -->
      <button
        @click="toggleBookmark"
        :disabled="isBookmarking"
        class="p-2 rounded-lg hover:bg-gray-50 transition-colors"
        :class="post.isBookmarked ? 'text-primary-600' : 'text-gray-600'"
      >
        <BookmarkIcon
          :class="[
            'w-5 h-5',
            post.isBookmarked ? 'fill-current' : ''
          ]"
        />
      </button>
    </div>

    <!-- Comments section -->
    <PostComments
      v-if="showComments"
      :post-id="post.id"
      :comments-count="post.commentsCount"
      class="mt-4 pt-4 border-t border-gray-100"
    />
  </article>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/vue'
import {
  HeartIcon,
  ChatBubbleOvalLeftIcon,
  ShareIcon,
  BookmarkIcon,
  EllipsisHorizontalIcon,
  CheckBadgeIcon,
  TrashIcon,
  FlagIcon,
  LinkIcon
} from '@heroicons/vue/24/outline'

const props = defineProps({
  post: {
    type: Object,
    required: true
  }
})

const postsStore = usePostsStore()
const authStore = useAuthStore()

const showComments = ref(false)
const isLiking = ref(false)
const isBookmarking = ref(false)

const isOwnPost = computed(() => {
  return authStore.currentUser?.id === props.post.author.id
})

const toggleLike = async () => {
  if (isLiking.value) return
  
  isLiking.value = true
  try {
    await postsStore.likePost(props.post.id)
  } catch (error) {
    console.error('Error liking post:', error)
  } finally {
    isLiking.value = false
  }
}

const toggleBookmark = async () => {
  if (isBookmarking.value) return
  
  isBookmarking.value = true
  try {
    await postsStore.bookmarkPost(props.post.id)
  } catch (error) {
    console.error('Error bookmarking post:', error)
  } finally {
    isBookmarking.value = false
  }
}

const toggleComments = () => {
  showComments.value = !showComments.value
}

const sharePost = async (platform) => {
  try {
    await postsStore.sharePost(props.post.id, platform)
    
    if (platform === 'twitter') {
      const url = `${window.location.origin}/post/${props.post.id}`
      const text = props.post.content?.substring(0, 200) || 'Check out this post'
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`)
    } else if (platform === 'facebook') {
      const url = `${window.location.origin}/post/${props.post.id}`
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`)
    }
  } catch (error) {
    console.error('Error sharing post:', error)
  }
}

const deletePost = async () => {
  if (confirm('Are you sure you want to delete this post?')) {
    try {
      await postsStore.deletePost(props.post.id)
    } catch (error) {
      console.error('Error deleting post:', error)
    }
  }
}

const reportPost = async () => {
  // TODO: Implement report modal
  console.log('Report post:', props.post.id)
}

const copyLink = async () => {
  const url = `${window.location.origin}/post/${props.post.id}`
  try {
    await navigator.clipboard.writeText(url)
    // TODO: Show toast notification
  } catch (error) {
    console.error('Error copying link:', error)
  }
}

const formatContent = (content) => {
  // Basic formatting: hashtags, mentions, links
  return content
    .replace(/#(\w+)/g, '<a href="/hashtag/$1" class="text-primary-600 hover:text-primary-500">#$1</a>')
    .replace(/@(\w+)/g, '<a href="/profile/$1" class="text-primary-600 hover:text-primary-500">@$1</a>')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-primary-600 hover:text-primary-500">$1</a>')
}

const formatTimeAgo = (date) => {
  const now = new Date()
  const postDate = new Date(date)
  const diffMs = now - postDate
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  
  return postDate.toLocaleDateString()
}

const formatDate = (date) => {
  return new Date(date).toLocaleString()
}
</script>