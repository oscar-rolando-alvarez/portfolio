// User and Authentication Types
export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  role: UserRole
  permissions: Permission[]
  preferences: UserPreferences
  isActive: boolean
  lastSeen: Date
  createdAt: Date
  updatedAt: Date
}

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  MEMBER = 'member',
  VIEWER = 'viewer'
}

export enum Permission {
  // Project permissions
  CREATE_PROJECT = 'create_project',
  EDIT_PROJECT = 'edit_project',
  DELETE_PROJECT = 'delete_project',
  VIEW_PROJECT = 'view_project',
  
  // Task permissions
  CREATE_TASK = 'create_task',
  EDIT_TASK = 'edit_task',
  DELETE_TASK = 'delete_task',
  ASSIGN_TASK = 'assign_task',
  
  // Team permissions
  INVITE_USERS = 'invite_users',
  MANAGE_USERS = 'manage_users',
  VIEW_REPORTS = 'view_reports',
  EXPORT_DATA = 'export_data'
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  language: string
  timezone: string
  notifications: NotificationSettings
  dashboardLayout: DashboardWidget[]
}

export interface NotificationSettings {
  email: boolean
  browser: boolean
  taskAssigned: boolean
  taskDue: boolean
  projectUpdates: boolean
  mentions: boolean
}

// Project Types
export interface Project {
  id: string
  name: string
  description: string
  color: string
  icon?: string
  status: ProjectStatus
  priority: Priority
  progress: number
  budget?: number
  actualCost?: number
  startDate: Date
  endDate?: Date
  createdBy: string
  team: ProjectMember[]
  tasks: Task[]
  customFields: CustomField[]
  tags: string[]
  isArchived: boolean
  createdAt: Date
  updatedAt: Date
}

export enum ProjectStatus {
  PLANNING = 'planning',
  ACTIVE = 'active',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export interface ProjectMember {
  userId: string
  role: ProjectRole
  joinedAt: Date
  permissions: Permission[]
}

export enum ProjectRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer'
}

// Task Types
export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  progress: number
  projectId: string
  parentTaskId?: string
  subtasks: Task[]
  assignees: string[]
  createdBy: string
  startDate?: Date
  dueDate?: Date
  completedAt?: Date
  estimatedTime?: number // in minutes
  actualTime?: number // in minutes
  tags: string[]
  attachments: Attachment[]
  comments: Comment[]
  customFields: Record<string, any>
  dependencies: TaskDependency[]
  checklist: ChecklistItem[]
  position: number
  createdAt: Date
  updatedAt: Date
}

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  IN_REVIEW = 'in_review',
  DONE = 'done',
  CANCELLED = 'cancelled'
}

export enum Priority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  URGENT = 4,
  CRITICAL = 5
}

export interface TaskDependency {
  taskId: string
  type: DependencyType
}

export enum DependencyType {
  BLOCKS = 'blocks',
  BLOCKED_BY = 'blocked_by',
  RELATES_TO = 'relates_to'
}

export interface ChecklistItem {
  id: string
  text: string
  completed: boolean
  assignee?: string
  dueDate?: Date
}

// Comment and Activity Types
export interface Comment {
  id: string
  content: string
  authorId: string
  taskId?: string
  projectId?: string
  parentId?: string
  replies: Comment[]
  mentions: string[]
  attachments: Attachment[]
  isEdited: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Activity {
  id: string
  type: ActivityType
  userId: string
  projectId?: string
  taskId?: string
  data: Record<string, any>
  createdAt: Date
}

export enum ActivityType {
  PROJECT_CREATED = 'project_created',
  PROJECT_UPDATED = 'project_updated',
  TASK_CREATED = 'task_created',
  TASK_UPDATED = 'task_updated',
  TASK_COMPLETED = 'task_completed',
  COMMENT_ADDED = 'comment_added',
  FILE_UPLOADED = 'file_uploaded',
  USER_ASSIGNED = 'user_assigned',
  USER_UNASSIGNED = 'user_unassigned'
}

// File and Attachment Types
export interface Attachment {
  id: string
  name: string
  size: number
  type: string
  url: string
  thumbnailUrl?: string
  uploadedBy: string
  uploadedAt: Date
}

// Custom Fields
export interface CustomField {
  id: string
  name: string
  type: CustomFieldType
  options?: string[]
  required: boolean
  projectId?: string
  position: number
}

export enum CustomFieldType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  SELECT = 'select',
  MULTI_SELECT = 'multi_select',
  CHECKBOX = 'checkbox',
  URL = 'url',
  EMAIL = 'email'
}

// Time Tracking Types
export interface TimeEntry {
  id: string
  userId: string
  taskId: string
  projectId: string
  description?: string
  startTime: Date
  endTime?: Date
  duration: number // in minutes
  isRunning: boolean
  createdAt: Date
  updatedAt: Date
}

// Notification Types
export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  data?: Record<string, any>
  isRead: boolean
  createdAt: Date
}

export enum NotificationType {
  TASK_ASSIGNED = 'task_assigned',
  TASK_DUE = 'task_due',
  TASK_OVERDUE = 'task_overdue',
  COMMENT_MENTION = 'comment_mention',
  PROJECT_INVITE = 'project_invite',
  DEADLINE_REMINDER = 'deadline_reminder'
}

// Dashboard and Analytics Types
export interface DashboardWidget {
  id: string
  type: WidgetType
  title: string
  position: { x: number; y: number; w: number; h: number }
  config: Record<string, any>
  isVisible: boolean
}

export enum WidgetType {
  TASK_OVERVIEW = 'task_overview',
  PROJECT_PROGRESS = 'project_progress',
  TIME_TRACKING = 'time_tracking',
  TEAM_ACTIVITY = 'team_activity',
  CALENDAR = 'calendar',
  RECENT_TASKS = 'recent_tasks',
  NOTIFICATIONS = 'notifications',
  ANALYTICS_CHART = 'analytics_chart'
}

export interface AnalyticsData {
  totalProjects: number
  activeProjects: number
  completedTasks: number
  overdueTasks: number
  teamProductivity: ProductivityMetric[]
  projectProgress: ProjectProgressMetric[]
  timeTracking: TimeTrackingMetric[]
}

export interface ProductivityMetric {
  userId: string
  tasksCompleted: number
  timeLogged: number
  period: string
}

export interface ProjectProgressMetric {
  projectId: string
  progress: number
  tasksTotal: number
  tasksCompleted: number
  daysRemaining: number
}

export interface TimeTrackingMetric {
  date: string
  totalTime: number
  projectBreakdown: { projectId: string; time: number }[]
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  errors?: string[]
  meta?: {
    page?: number
    limit?: number
    total?: number
    totalPages?: number
  }
}

export interface PaginationParams {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  search?: string
  filters?: Record<string, any>
}

// WebSocket Types
export interface WebSocketMessage {
  type: string
  data: any
  timestamp: Date
  userId?: string
  projectId?: string
  taskId?: string
}

// Export and Integration Types
export interface ExportOptions {
  format: 'pdf' | 'excel' | 'csv'
  includeSubtasks: boolean
  includeTags: boolean
  includeComments: boolean
  includeTimeTracking: boolean
  dateRange?: {
    start: Date
    end: Date
  }
}

export interface IntegrationConfig {
  id: string
  name: string
  type: IntegrationType
  isActive: boolean
  settings: Record<string, any>
  lastSync?: Date
}

export enum IntegrationType {
  SLACK = 'slack',
  GITHUB = 'github',
  JIRA = 'jira',
  GOOGLE_CALENDAR = 'google_calendar',
  OUTLOOK = 'outlook',
  ZAPIER = 'zapier'
}

// Form and Validation Types
export interface FormField {
  name: string
  label: string
  type: string
  required: boolean
  validation?: ValidationRule[]
  placeholder?: string
  helpText?: string
}

export interface ValidationRule {
  type: string
  value?: any
  message: string
}

// Search and Filter Types
export interface SearchFilters {
  query?: string
  projectIds?: string[]
  assignees?: string[]
  statuses?: TaskStatus[]
  priorities?: Priority[]
  tags?: string[]
  dateRange?: {
    start: Date
    end: Date
  }
  customFields?: Record<string, any>
}

export interface SearchResult {
  type: 'project' | 'task' | 'comment'
  id: string
  title: string
  description?: string
  projectId?: string
  relevance: number
  highlights: string[]
}