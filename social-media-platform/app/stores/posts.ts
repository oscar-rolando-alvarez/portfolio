import { defineStore } from 'pinia'
import type { FeedPage, PostDTO } from '#shared/types'

export const usePostsStore = defineStore('posts', () => {
  const posts = ref<PostDTO[]>([])
  const nextPage = ref<number | null>(1)
  const loading = ref(false)

  const hasMore = computed(() => nextPage.value !== null)

  async function fetchFeed(reset = false) {
    if (reset) {
      posts.value = []
      nextPage.value = 1
    }
    if (loading.value || nextPage.value === null) return
    loading.value = true
    try {
      const page = await useRequestFetch()<FeedPage>('/api/posts/feed', { query: { page: nextPage.value, limit: 10 } })
      const seen = new Set(posts.value.map(p => p.id))
      posts.value.push(...page.posts.filter(p => !seen.has(p.id)))
      nextPage.value = page.nextPage
    } finally {
      loading.value = false
    }
  }

  async function createPost(input: { content: string, images?: string[], visibility?: PostDTO['visibility'] }) {
    const post = await $fetch<PostDTO>('/api/posts', { method: 'POST', body: input })
    posts.value.unshift(post)
    return post
  }

  /** Optimistically toggles a like and reconciles with the server count. */
  async function toggleLike(postId: string) {
    const post = posts.value.find(p => p.id === postId)
    if (!post) return
    const before = { isLiked: post.isLiked, likesCount: post.likesCount }
    post.isLiked = !post.isLiked
    post.likesCount += post.isLiked ? 1 : -1
    try {
      const res = await $fetch<{ liked: boolean, likesCount: number }>(`/api/posts/${postId}/like`, { method: 'POST' })
      post.isLiked = res.liked
      post.likesCount = res.likesCount
    } catch (error) {
      Object.assign(post, before)
      throw error
    }
  }

  function incrementComments(postId: string) {
    const post = posts.value.find(p => p.id === postId)
    if (post) post.commentsCount += 1
  }

  return { posts, nextPage, loading, hasMore, fetchFeed, createPost, toggleLike, incrementComments }
})
