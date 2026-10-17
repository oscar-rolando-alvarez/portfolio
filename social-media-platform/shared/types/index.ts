// API data-transfer objects shared by the Nuxt app (app/) and the Nitro API (server/).
// Dates are ISO strings because they cross the JSON boundary.

export type PostVisibility = 'PUBLIC' | 'FOLLOWERS'
export type ModerationStatus = 'APPROVED' | 'FLAGGED'
export type NotificationType = 'LIKE' | 'COMMENT' | 'FOLLOW' | 'MESSAGE'

export interface UserSummary {
  id: string
  username: string
  displayName: string
  avatar: string | null
  verified: boolean
}

export interface CurrentUser extends UserSummary {
  email: string
  bio: string | null
}

export interface UserProfile extends UserSummary {
  bio: string | null
  createdAt: string
  followersCount: number
  followingCount: number
  postsCount: number
  isFollowing: boolean
  isSelf: boolean
}

export interface PostDTO {
  id: string
  content: string
  images: string[]
  visibility: PostVisibility
  moderation: ModerationStatus
  createdAt: string
  author: UserSummary
  likesCount: number
  commentsCount: number
  isLiked: boolean
}

export interface CommentDTO {
  id: string
  content: string
  createdAt: string
  author: UserSummary
}

export interface FeedPage {
  posts: PostDTO[]
  nextPage: number | null
}

export interface MessageDTO {
  id: string
  conversationId: string
  content: string
  createdAt: string
  sender: UserSummary
}

export interface ConversationDTO {
  id: string
  participants: UserSummary[]
  lastMessage: MessageDTO | null
  lastMessageAt: string | null
  unread: boolean
}

export interface NotificationDTO {
  id: string
  type: NotificationType
  read: boolean
  createdAt: string
  actor: UserSummary | null
  postId: string | null
}

/** Events pushed to browsers over the /_ws WebSocket. */
export type RealtimeEvent
  = | { type: 'message', message: MessageDTO }
    | { type: 'notification', notification: NotificationDTO }
