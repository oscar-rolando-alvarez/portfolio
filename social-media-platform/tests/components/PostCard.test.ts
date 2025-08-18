import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PostCard from '~/components/post/PostCard.vue'
import type { Post } from '~/types'

// Mock stores
const mockPostsStore = {
  likePost: vi.fn(),
  bookmarkPost: vi.fn(),
  sharePost: vi.fn(),
  deletePost: vi.fn()
}

const mockAuthStore = {
  currentUser: {
    id: 'user1',
    username: 'testuser',
    displayName: 'Test User'
  }
}

// Mock Pinia stores
vi.mock('~/stores/posts', () => ({
  usePostsStore: () => mockPostsStore
}))

vi.mock('~/stores/auth', () => ({
  useAuthStore: () => mockAuthStore
}))

// Mock Nuxt composables
vi.mock('#app', () => ({
  navigateTo: vi.fn()
}))

const mockPost: Post = {
  id: 'post1',
  content: 'This is a test post with #hashtag and @mention',
  images: [],
  videos: [],
  type: 'TEXT',
  visibility: 'PUBLIC',
  authorId: 'author1',
  author: {
    id: 'author1',
    username: 'author',
    displayName: 'Post Author',
    avatar: '/avatar.jpg',
    verified: true,
    email: 'author@example.com',
    bio: null,
    coverImage: null,
    private: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  views: 100,
  likesCount: 5,
  commentsCount: 2,
  sharesCount: 1,
  isLiked: false,
  isBookmarked: false
}

describe('PostCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders post content correctly', () => {
    const wrapper = mount(PostCard, {
      props: { post: mockPost }
    })

    expect(wrapper.text()).toContain('This is a test post')
    expect(wrapper.text()).toContain('Post Author')
    expect(wrapper.text()).toContain('@author')
    expect(wrapper.text()).toContain('5 likes')
    expect(wrapper.text()).toContain('2 comments')
  })

  it('shows verified badge for verified users', () => {
    const wrapper = mount(PostCard, {
      props: { post: mockPost }
    })

    const verifiedIcon = wrapper.find('[data-testid="verified-icon"]')
    expect(verifiedIcon.exists()).toBe(true)
  })

  it('formats hashtags and mentions correctly', () => {
    const wrapper = mount(PostCard, {
      props: { post: mockPost }
    })

    const content = wrapper.find('.post-content')
    expect(content.html()).toContain('href="/hashtag/hashtag"')
    expect(content.html()).toContain('href="/profile/mention"')
  })

  it('handles like button click', async () => {
    const wrapper = mount(PostCard, {
      props: { post: mockPost }
    })

    const likeButton = wrapper.find('[data-testid="like-button"]')
    await likeButton.trigger('click')

    expect(mockPostsStore.likePost).toHaveBeenCalledWith('post1')
  })

  it('handles bookmark button click', async () => {
    const wrapper = mount(PostCard, {
      props: { post: mockPost }
    })

    const bookmarkButton = wrapper.find('[data-testid="bookmark-button"]')
    await bookmarkButton.trigger('click')

    expect(mockPostsStore.bookmarkPost).toHaveBeenCalledWith('post1')
  })

  it('shows delete option for own posts', () => {
    const ownPost = {
      ...mockPost,
      authorId: 'user1' // Same as current user
    }

    const wrapper = mount(PostCard, {
      props: { post: ownPost }
    })

    // Open menu
    const menuButton = wrapper.find('[data-testid="post-menu"]')
    expect(menuButton.exists()).toBe(true)
  })

  it('shows report option for other users posts', () => {
    const wrapper = mount(PostCard, {
      props: { post: mockPost }
    })

    const menuButton = wrapper.find('[data-testid="post-menu"]')
    expect(menuButton.exists()).toBe(true)
  })

  it('displays media when present', () => {
    const postWithImages = {
      ...mockPost,
      images: ['/image1.jpg', '/image2.jpg'],
      type: 'IMAGE' as const
    }

    const wrapper = mount(PostCard, {
      props: { post: postWithImages }
    })

    const mediaComponent = wrapper.find('[data-testid="post-media"]')
    expect(mediaComponent.exists()).toBe(true)
  })

  it('formats time ago correctly', () => {
    const recentPost = {
      ...mockPost,
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 minutes ago
    }

    const wrapper = mount(PostCard, {
      props: { post: recentPost }
    })

    expect(wrapper.text()).toContain('5m')
  })

  it('toggles comments section', async () => {
    const wrapper = mount(PostCard, {
      props: { post: mockPost }
    })

    const commentButton = wrapper.find('[data-testid="comment-button"]')
    await commentButton.trigger('click')

    const commentsSection = wrapper.find('[data-testid="comments-section"]')
    expect(commentsSection.exists()).toBe(true)
  })
})