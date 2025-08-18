import { defineStore } from 'pinia'
import type { Post, PostForm, Comment, ApiResponse, PaginatedResponse } from '~/types'

interface PostsState {
  posts: Post[]
  currentPost: Post | null
  comments: Comment[]
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  page: number
  error: string | null
}

export const usePostsStore = defineStore('posts', {
  state: (): PostsState => ({
    posts: [],
    currentPost: null,
    comments: [],
    isLoading: false,
    isLoadingMore: false,
    hasMore: true,
    page: 1,
    error: null
  }),

  getters: {
    feedPosts: (state) => state.posts,
    postById: (state) => (id: string) => state.posts.find(post => post.id === id),
    postComments: (state) => state.comments
  },

  actions: {
    setLoading(loading: boolean) {
      this.isLoading = loading
    },

    setLoadingMore(loading: boolean) {
      this.isLoadingMore = loading
    },

    setError(error: string | null) {
      this.error = error
    },

    setPosts(posts: Post[]) {
      this.posts = posts
    },

    addPost(post: Post) {
      this.posts.unshift(post)
    },

    updatePost(postId: string, updates: Partial<Post>) {
      const index = this.posts.findIndex(p => p.id === postId)
      if (index !== -1) {
        this.posts[index] = { ...this.posts[index], ...updates }
      }
      if (this.currentPost?.id === postId) {
        this.currentPost = { ...this.currentPost, ...updates }
      }
    },

    removePost(postId: string) {
      this.posts = this.posts.filter(p => p.id !== postId)
      if (this.currentPost?.id === postId) {
        this.currentPost = null
      }
    },

    setComments(comments: Comment[]) {
      this.comments = comments
    },

    addComment(comment: Comment) {
      this.comments.unshift(comment)
      // Update post comment count
      this.updatePost(comment.postId, {
        commentsCount: (this.postById(comment.postId)?.commentsCount || 0) + 1
      })
    },

    async fetchFeed(refresh = false) {
      if (refresh) {
        this.page = 1
        this.hasMore = true
      }

      this.setLoading(!refresh)
      this.setError(null)

      try {
        const authStore = useAuthStore()
        const { data } = await $fetch<ApiResponse<PaginatedResponse<Post>>>('/api/posts/feed', {
          query: { page: this.page, limit: 10 },
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        if (data) {
          if (refresh) {
            this.setPosts(data.data)
          } else {
            this.posts.push(...data.data)
          }
          
          this.hasMore = data.pagination.hasNext
          this.page = data.pagination.page
        }
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to load posts')
        throw error
      } finally {
        this.setLoading(false)
      }
    },

    async loadMorePosts() {
      if (!this.hasMore || this.isLoadingMore) return

      this.setLoadingMore(true)
      this.page += 1

      try {
        await this.fetchFeed()
      } catch (error) {
        this.page -= 1 // Revert page increment on error
        throw error
      } finally {
        this.setLoadingMore(false)
      }
    },

    async createPost(postData: PostForm) {
      this.setLoading(true)
      this.setError(null)

      try {
        const authStore = useAuthStore()
        const formData = new FormData()
        
        if (postData.content) formData.append('content', postData.content)
        formData.append('type', postData.type)
        formData.append('visibility', postData.visibility)

        // Append images
        postData.images?.forEach((image, index) => {
          formData.append(`images`, image)
        })

        // Append videos
        postData.videos?.forEach((video, index) => {
          formData.append(`videos`, video)
        })

        const { data } = await $fetch<ApiResponse<{ post: Post }>>('/api/posts', {
          method: 'POST',
          body: formData,
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        if (data) {
          this.addPost(data.post)
          return data.post
        }
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to create post')
        throw error
      } finally {
        this.setLoading(false)
      }
    },

    async deletePost(postId: string) {
      try {
        const authStore = useAuthStore()
        await $fetch(`/api/posts/${postId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        this.removePost(postId)
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to delete post')
        throw error
      }
    },

    async likePost(postId: string) {
      try {
        const authStore = useAuthStore()
        const post = this.postById(postId)
        if (!post) return

        // Optimistic update
        const wasLiked = post.isLiked
        this.updatePost(postId, {
          isLiked: !wasLiked,
          likesCount: post.likesCount + (wasLiked ? -1 : 1)
        })

        const { data } = await $fetch<ApiResponse<{ liked: boolean; likesCount: number }>>(`/api/posts/${postId}/like`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        if (data) {
          this.updatePost(postId, {
            isLiked: data.liked,
            likesCount: data.likesCount
          })
        }
      } catch (error: any) {
        // Revert optimistic update on error
        const post = this.postById(postId)
        if (post) {
          this.updatePost(postId, {
            isLiked: !post.isLiked,
            likesCount: post.likesCount + (post.isLiked ? -1 : 1)
          })
        }
        this.setError(error.data?.message || 'Failed to like post')
        throw error
      }
    },

    async bookmarkPost(postId: string) {
      try {
        const authStore = useAuthStore()
        const post = this.postById(postId)
        if (!post) return

        // Optimistic update
        const wasBookmarked = post.isBookmarked
        this.updatePost(postId, {
          isBookmarked: !wasBookmarked
        })

        const { data } = await $fetch<ApiResponse<{ bookmarked: boolean }>>(`/api/posts/${postId}/bookmark`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        if (data) {
          this.updatePost(postId, {
            isBookmarked: data.bookmarked
          })
        }
      } catch (error: any) {
        // Revert optimistic update on error
        const post = this.postById(postId)
        if (post) {
          this.updatePost(postId, {
            isBookmarked: !post.isBookmarked
          })
        }
        this.setError(error.data?.message || 'Failed to bookmark post')
        throw error
      }
    },

    async fetchPostComments(postId: string) {
      this.setLoading(true)
      this.setError(null)

      try {
        const authStore = useAuthStore()
        const { data } = await $fetch<ApiResponse<Comment[]>>(`/api/posts/${postId}/comments`, {
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        if (data) {
          this.setComments(data)
        }
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to load comments')
        throw error
      } finally {
        this.setLoading(false)
      }
    },

    async createComment(postId: string, content: string, parentId?: string) {
      try {
        const authStore = useAuthStore()
        const { data } = await $fetch<ApiResponse<{ comment: Comment }>>(`/api/posts/${postId}/comments`, {
          method: 'POST',
          body: { content, parentId },
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        if (data) {
          this.addComment(data.comment)
          return data.comment
        }
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to create comment')
        throw error
      }
    },

    async sharePost(postId: string, platform: string = 'internal') {
      try {
        const authStore = useAuthStore()
        const { data } = await $fetch<ApiResponse<{ sharesCount: number }>>(`/api/posts/${postId}/share`, {
          method: 'POST',
          body: { platform },
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        if (data) {
          this.updatePost(postId, {
            sharesCount: data.sharesCount
          })
        }
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to share post')
        throw error
      }
    },

    async reportPost(postId: string, reason: string, description?: string) {
      try {
        const authStore = useAuthStore()
        await $fetch(`/api/posts/${postId}/report`, {
          method: 'POST',
          body: { reason, description },
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to report post')
        throw error
      }
    },

    // Reset store state
    reset() {
      this.posts = []
      this.currentPost = null
      this.comments = []
      this.isLoading = false
      this.isLoadingMore = false
      this.hasMore = true
      this.page = 1
      this.error = null
    }
  }
})