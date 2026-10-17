import { beforeEach, describe, expect, it } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { usePostsStore } from '~/stores/posts'
import { useInboxStore } from '~/stores/inbox'
import { makePost } from '../fixtures'

let likeFails = false

registerEndpoint('/api/posts/feed', () => ({ posts: [makePost(), makePost({ id: 'p2' })], nextPage: null }))
registerEndpoint('/api/posts/p1/like', {
  method: 'POST',
  handler: () => {
    if (likeFails) throw new Error('down')
    return { liked: true, likesCount: 10 }
  }
})
registerEndpoint('/api/conversations', () => [
  { id: 'c1', participants: [], lastMessage: null, lastMessageAt: null, unread: false },
  { id: 'c2', participants: [], lastMessage: null, lastMessageAt: null, unread: false }
])

describe('posts store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    likeFails = false
  })

  it('loads the feed and tracks pagination', async () => {
    const store = usePostsStore()
    await store.fetchFeed(true)
    expect(store.posts.map(p => p.id)).toEqual(['p1', 'p2'])
    expect(store.hasMore).toBe(false)
  })

  it('reconciles optimistic likes with the server', async () => {
    const store = usePostsStore()
    await store.fetchFeed(true)
    await store.toggleLike('p1')
    expect(store.posts[0]).toMatchObject({ isLiked: true, likesCount: 10 })
  })

  it('rolls back a like when the request fails', async () => {
    const store = usePostsStore()
    await store.fetchFeed(true)
    likeFails = true
    await expect(store.toggleLike('p1')).rejects.toBeTruthy()
    expect(store.posts[0]).toMatchObject({ isLiked: false, likesCount: 2 })
  })
})

describe('inbox store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('applies realtime messages and moves the conversation to the top', async () => {
    const inbox = useInboxStore()
    await inbox.fetchConversations()
    inbox.handleRealtime({
      type: 'message',
      message: { id: 'm1', conversationId: 'c2', content: 'hey', createdAt: new Date().toISOString(), sender: makePost().author }
    })
    expect(inbox.conversations[0]).toMatchObject({ id: 'c2', unread: true })
    expect(inbox.messages.c2?.map(m => m.id)).toEqual(['m1'])
    expect(inbox.unreadConversations).toBe(1)
  })

  it('ignores duplicate deliveries', async () => {
    const inbox = useInboxStore()
    await inbox.fetchConversations()
    const message = { id: 'm1', conversationId: 'c1', content: 'x', createdAt: new Date().toISOString(), sender: makePost().author }
    inbox.receiveMessage(message)
    inbox.receiveMessage(message)
    expect(inbox.messages.c1).toHaveLength(1)
  })

  it('collects realtime notifications', () => {
    const inbox = useInboxStore()
    inbox.handleRealtime({ type: 'notification', notification: { id: 'n1', type: 'LIKE', read: false, createdAt: new Date().toISOString(), actor: null, postId: 'p1' } })
    expect(inbox.unreadNotifications).toBe(1)
  })
})
