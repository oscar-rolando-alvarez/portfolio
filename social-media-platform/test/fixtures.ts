import type { PostDTO } from '#shared/types'

export function makePost(overrides: Partial<PostDTO> = {}): PostDTO {
  return {
    id: 'p1',
    content: 'Hello world',
    images: [],
    visibility: 'PUBLIC',
    moderation: 'APPROVED',
    createdAt: new Date().toISOString(),
    author: { id: 'u1', username: 'alice', displayName: 'Alice Johnson', avatar: null, verified: true },
    likesCount: 2,
    commentsCount: 1,
    isLiked: false,
    ...overrides
  }
}
