import { defineStore } from 'pinia'
import type { Story, StoryView, ApiResponse } from '~/types'

interface StoriesState {
  stories: Story[]
  viewedStories: Set<string>
  currentStory: Story | null
  currentStoryIndex: number
  isLoading: boolean
  error: string | null
}

export const useStoriesStore = defineStore('stories', {
  state: (): StoriesState => ({
    stories: [],
    viewedStories: new Set(),
    currentStory: null,
    currentStoryIndex: 0,
    isLoading: false,
    error: null
  }),

  getters: {
    unviewedStories: (state) => 
      state.stories.filter(story => !state.viewedStories.has(story.id)),
    
    viewedStoriesArray: (state) => 
      state.stories.filter(story => state.viewedStories.has(story.id)),

    storiesByUser: (state) => {
      const grouped = new Map<string, Story[]>()
      state.stories.forEach(story => {
        const userId = story.authorId
        if (!grouped.has(userId)) {
          grouped.set(userId, [])
        }
        grouped.get(userId)!.push(story)
      })
      return grouped
    },

    hasUnviewedStories: (state) => state.unviewedStories.length > 0
  },

  actions: {
    setLoading(loading: boolean) {
      this.isLoading = loading
    },

    setError(error: string | null) {
      this.error = error
    },

    setStories(stories: Story[]) {
      this.stories = stories
      // Update viewed stories set
      this.viewedStories = new Set(
        stories.filter(s => s.isViewed).map(s => s.id)
      )
    },

    addStory(story: Story) {
      this.stories.unshift(story)
    },

    removeStory(storyId: string) {
      this.stories = this.stories.filter(s => s.id !== storyId)
      this.viewedStories.delete(storyId)
      
      if (this.currentStory?.id === storyId) {
        this.currentStory = null
      }
    },

    markStoryAsViewed(storyId: string) {
      this.viewedStories.add(storyId)
      
      // Update story in array
      const story = this.stories.find(s => s.id === storyId)
      if (story) {
        story.isViewed = true
      }
    },

    setCurrentStory(story: Story | null, index: number = 0) {
      this.currentStory = story
      this.currentStoryIndex = index
    },

    async fetchStories() {
      this.setLoading(true)
      this.setError(null)

      try {
        const authStore = useAuthStore()
        const { data } = await $fetch<ApiResponse<Story[]>>('/api/stories', {
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        if (data) {
          this.setStories(data)
        }
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to load stories')
        throw error
      } finally {
        this.setLoading(false)
      }
    },

    async createStory(content: string | null, mediaFiles: File[], type: 'IMAGE' | 'VIDEO' | 'TEXT' = 'TEXT') {
      this.setLoading(true)
      this.setError(null)

      try {
        const authStore = useAuthStore()
        const formData = new FormData()
        
        if (content) formData.append('content', content)
        formData.append('type', type)

        // Append media files
        mediaFiles.forEach((file) => {
          formData.append('media', file)
        })

        const { data } = await $fetch<ApiResponse<{ story: Story }>>('/api/stories', {
          method: 'POST',
          body: formData,
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        if (data) {
          this.addStory(data.story)
          return data.story
        }
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to create story')
        throw error
      } finally {
        this.setLoading(false)
      }
    },

    async viewStory(storyId: string) {
      try {
        const authStore = useAuthStore()
        
        // Optimistically mark as viewed
        this.markStoryAsViewed(storyId)

        await $fetch(`/api/stories/${storyId}/view`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })
      } catch (error: any) {
        // Revert optimistic update on error
        this.viewedStories.delete(storyId)
        const story = this.stories.find(s => s.id === storyId)
        if (story) {
          story.isViewed = false
        }
        
        this.setError(error.data?.message || 'Failed to mark story as viewed')
        throw error
      }
    },

    async deleteStory(storyId: string) {
      try {
        const authStore = useAuthStore()
        await $fetch(`/api/stories/${storyId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        this.removeStory(storyId)
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to delete story')
        throw error
      }
    },

    async getStoryViews(storyId: string) {
      try {
        const authStore = useAuthStore()
        const { data } = await $fetch<ApiResponse<StoryView[]>>(`/api/stories/${storyId}/views`, {
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        return data || []
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to load story views')
        throw error
      }
    },

    // Story viewer navigation
    nextStory() {
      if (this.currentStoryIndex < this.stories.length - 1) {
        this.currentStoryIndex++
        this.currentStory = this.stories[this.currentStoryIndex]
        
        // Auto-mark as viewed
        if (this.currentStory && !this.viewedStories.has(this.currentStory.id)) {
          this.viewStory(this.currentStory.id)
        }
      }
    },

    previousStory() {
      if (this.currentStoryIndex > 0) {
        this.currentStoryIndex--
        this.currentStory = this.stories[this.currentStoryIndex]
      }
    },

    closeStoryViewer() {
      this.currentStory = null
      this.currentStoryIndex = 0
    },

    // Clean up expired stories (client-side filtering)
    removeExpiredStories() {
      const now = new Date()
      this.stories = this.stories.filter(story => {
        const expiresAt = new Date(story.expiresAt)
        return expiresAt > now
      })
    },

    // Initialize stories and set up periodic cleanup
    async initializeStories() {
      await this.fetchStories()
      
      // Clean up expired stories every minute
      if (process.client) {
        setInterval(() => {
          this.removeExpiredStories()
        }, 60000) // 1 minute
      }
    },

    // Reset store state
    reset() {
      this.stories = []
      this.viewedStories = new Set()
      this.currentStory = null
      this.currentStoryIndex = 0
      this.isLoading = false
      this.error = null
    }
  }
})