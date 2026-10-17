import type { CommentDTO, MessageDTO, PostDTO, UserSummary } from '#shared/types'

interface PostRow {
  id: string
  content: string
  images: string[]
  visibility: PostDTO['visibility']
  moderation: PostDTO['moderation']
  createdAt: Date
  author: UserSummary
  _count: { likes: number, comments: number }
  likes: { id: string }[]
}

/** Prisma include used for every post returned to clients. */
export function postInclude(viewerId: string) {
  return {
    author: { select: userSummarySelect },
    _count: { select: { likes: true, comments: true } },
    likes: { where: { userId: viewerId }, select: { id: true } }
  } as const
}

export function toPostDTO(row: PostRow): PostDTO {
  return {
    id: row.id,
    content: row.content,
    images: row.images,
    visibility: row.visibility,
    moderation: row.moderation,
    createdAt: row.createdAt.toISOString(),
    author: row.author,
    likesCount: row._count.likes,
    commentsCount: row._count.comments,
    isLiked: row.likes.length > 0
  }
}

export function toCommentDTO(row: { id: string, content: string, createdAt: Date, author: UserSummary }): CommentDTO {
  return { id: row.id, content: row.content, createdAt: row.createdAt.toISOString(), author: row.author }
}

export function toMessageDTO(row: { id: string, conversationId: string, content: string, createdAt: Date, sender: UserSummary }): MessageDTO {
  return {
    id: row.id,
    conversationId: row.conversationId,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    sender: row.sender
  }
}
