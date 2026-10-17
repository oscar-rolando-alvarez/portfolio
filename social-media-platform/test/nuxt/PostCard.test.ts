import { describe, expect, it } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import PostCard from '~/components/post/PostCard.vue'
import { makePost } from '../fixtures'

registerEndpoint('/api/posts/p1/comments', {
  method: 'GET',
  handler: () => [
    { id: 'c1', content: 'Great post!', createdAt: new Date().toISOString(), author: { id: 'u2', username: 'bob', displayName: 'Bob Martinez', avatar: null, verified: false } }
  ]
})

describe('PostCard', () => {
  it('renders author, content and counters', async () => {
    const wrapper = await mountSuspended(PostCard, { props: { post: makePost() } })
    expect(wrapper.text()).toContain('Alice Johnson')
    expect(wrapper.text()).toContain('@alice')
    expect(wrapper.get('[data-testid="post-content"]').text()).toBe('Hello world')
    expect(wrapper.get('[data-testid="like-button"]').text()).toContain('2')
    expect(wrapper.find('[aria-label="Verified"]').exists()).toBe(true)
  })

  it('emits like with the post id', async () => {
    const wrapper = await mountSuspended(PostCard, { props: { post: makePost() } })
    await wrapper.get('[data-testid="like-button"]').trigger('click')
    expect(wrapper.emitted('like')).toEqual([['p1']])
  })

  it('shows moderation and visibility badges', async () => {
    const wrapper = await mountSuspended(PostCard, { props: { post: makePost({ moderation: 'FLAGGED', visibility: 'FOLLOWERS' }) } })
    expect(wrapper.text()).toContain('Under review')
    expect(wrapper.text()).toContain('Followers')
  })

  it('lazy-loads comments when expanded', async () => {
    const wrapper = await mountSuspended(PostCard, { props: { post: makePost() } })
    expect(wrapper.text()).not.toContain('Great post!')
    await wrapper.get('[data-testid="comments-button"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(wrapper.text()).toContain('Great post!')
  })
})
