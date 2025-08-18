// User types
export interface User {
  id: string
  email: string
  username: string
  displayName: string | null
  bio: string | null
  avatar: string | null
  coverImage: string | null
  verified: boolean
  private: boolean
  createdAt: string
  updatedAt: string
}

export interface UserProfile extends User {
  followersCount: number
  followingCount: number
  postsCount: number
  isFollowing?: boolean
  isBlocked?: boolean
}

// Post types
export interface Post {
  id: string
  content: string | null
  images: string[]
  videos: string[]
  type: PostType
  visibility: PostVisibility
  authorId: string
  author: User
  createdAt: string
  updatedAt: string
  views: number
  likesCount: number
  commentsCount: number
  sharesCount: number
  isLiked?: boolean
  isBookmarked?: boolean
}

export interface Comment {
  id: string
  content: string
  postId: string
  authorId: string
  author: User
  parentId: string | null
  replies?: Comment[]
  createdAt: string
  updatedAt: string
  likesCount: number
  isLiked?: boolean
}

// Story types
export interface Story {
  id: string
  content: string | null
  media: string[]
  type: StoryType
  authorId: string
  author: User
  expiresAt: string
  createdAt: string
  views: StoryView[]
  isViewed?: boolean
}

export interface StoryView {
  id: string
  storyId: string
  userId: string
  viewedAt: string
}

// Message types
export interface Message {
  id: string
  content: string | null
  images: string[]
  videos: string[]
  type: MessageType
  conversationId: string
  senderId: string
  sender: User
  receiverId: string | null
  receiver?: User | null
  replyToId: string | null
  replyTo?: Message | null
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
  deliveredAt: string | null
  readAt: string | null
}

export interface Conversation {
  id: string
  type: ConversationType
  name: string | null
  image: string | null
  createdAt: string
  updatedAt: string
  lastMessageAt: string | null
  participants: ConversationParticipant[]
  lastMessage?: Message
  unreadCount?: number
}

export interface ConversationParticipant {
  id: string
  conversationId: string
  userId: string
  user: User
  joinedAt: string
  lastReadAt: string | null
  role: ParticipantRole
}

// Notification types
export interface Notification {
  id: string
  type: NotificationType
  title: string
  content: string
  data: any
  userId: string
  read: boolean
  createdAt: string
}

// Analytics types
export interface AnalyticsEvent {
  id: string
  eventType: string
  eventData: any
  userId: string | null
  postId: string | null
  sessionId: string | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

// Privacy types
export interface PrivacySettings {
  id: string
  userId: string
  profileVisibility: PrivacyLevel
  postsVisibility: PrivacyLevel
  storiesVisibility: PrivacyLevel
  messagingVisibility: PrivacyLevel
  onlineStatusVisible: boolean
  readReceiptsEnabled: boolean
  dataProcessingConsent: boolean
  analyticsConsent: boolean
  marketingConsent: boolean
  createdAt: string
  updatedAt: string
}

// Report types
export interface Report {
  id: string
  type: ReportType
  reason: string
  description: string | null
  reporterId: string
  reporter: User
  reportedId: string
  reported: User
  postId: string | null
  post?: Post | null
  status: ReportStatus
  reviewed: boolean
  reviewedAt: string | null
  reviewerId: string | null
  action: string | null
  createdAt: string
}

// Enums
export enum PostType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  LINK = 'LINK',
  POLL = 'POLL'
}

export enum PostVisibility {
  PUBLIC = 'PUBLIC',
  FRIENDS = 'FRIENDS',
  PRIVATE = 'PRIVATE'
}

export enum StoryType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  TEXT = 'TEXT'
}

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  FILE = 'FILE',
  SYSTEM = 'SYSTEM'
}

export enum ConversationType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP'
}

export enum ParticipantRole {
  MEMBER = 'MEMBER',
  ADMIN = 'ADMIN',
  OWNER = 'OWNER'
}

export enum NotificationType {
  LIKE = 'LIKE',
  COMMENT = 'COMMENT',
  FOLLOW = 'FOLLOW',
  MESSAGE = 'MESSAGE',
  MENTION = 'MENTION',
  STORY_VIEW = 'STORY_VIEW',
  POST_SHARE = 'POST_SHARE',
  SYSTEM = 'SYSTEM'
}

export enum PrivacyLevel {
  PUBLIC = 'PUBLIC',
  FRIENDS = 'FRIENDS',
  PRIVATE = 'PRIVATE'
}

export enum ReportType {
  SPAM = 'SPAM',
  HARASSMENT = 'HARASSMENT',
  INAPPROPRIATE_CONTENT = 'INAPPROPRIATE_CONTENT',
  COPYRIGHT = 'COPYRIGHT',
  FAKE_PROFILE = 'FAKE_PROFILE',
  OTHER = 'OTHER'
}

export enum ReportStatus {
  PENDING = 'PENDING',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED'
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  data?: T
  error?: string
}

export interface PaginatedResponse<T = any> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

// Form types
export interface LoginForm {
  identifier: string
  password: string
}

export interface RegisterForm {
  email: string
  username: string
  password: string
  displayName?: string
}

export interface PostForm {
  content?: string
  images?: File[]
  videos?: File[]
  type: PostType
  visibility: PostVisibility
}

export interface MessageForm {
  content?: string
  images?: File[]
  videos?: File[]
  type: MessageType
  replyToId?: string
}

export interface ProfileUpdateForm {
  displayName?: string
  bio?: string
  avatar?: File
  coverImage?: File
}

// WebSocket types
export interface WebSocketMessage {
  type: string
  data: any
  timestamp: string
}

export interface TypingIndicator {
  conversationId: string
  userId: string
  username: string
  isTyping: boolean
}

// Upload types
export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

export interface MediaUpload {
  file: File
  preview: string
  progress: UploadProgress
  uploaded: boolean
  url?: string
  error?: string
}

// Search types
export interface SearchResult {
  users: User[]
  posts: Post[]
  hashtags: string[]
}

// Theme types
export interface Theme {
  name: string
  colors: {
    primary: string
    secondary: string
    background: string
    surface: string
    text: string
  }
}

// Device types
export interface DeviceInfo {
  type: 'mobile' | 'tablet' | 'desktop'
  os: string
  browser: string
  pushSupported: boolean
}