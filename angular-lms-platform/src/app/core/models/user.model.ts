export enum UserRole {
  STUDENT = 'student',
  INSTRUCTOR = 'instructor',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin'
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending'
}

export enum SubscriptionType {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise'
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username?: string;
  avatar?: string;
  bio?: string;
  title?: string;
  organization?: string;
  location?: string;
  website?: string;
  socialLinks?: SocialLinks;
  dateOfBirth?: Date;
  phoneNumber?: string;
  timezone?: string;
  language?: string;
}

export interface SocialLinks {
  linkedin?: string;
  twitter?: string;
  github?: string;
  portfolio?: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: NotificationPreferences;
  privacy: PrivacyPreferences;
  accessibility: AccessibilityPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
  courseUpdates: boolean;
  assignmentReminders: boolean;
  forumReplies: boolean;
  systemAnnouncements: boolean;
  marketing: boolean;
}

export interface PrivacyPreferences {
  profileVisibility: 'public' | 'private' | 'connections';
  showEmail: boolean;
  showProgress: boolean;
  allowDirectMessages: boolean;
  allowCourseRecommendations: boolean;
}

export interface AccessibilityPreferences {
  highContrast: boolean;
  largeText: boolean;
  reducedMotion: boolean;
  screenReaderMode: boolean;
  keyboardNavigation: boolean;
  colorBlindMode?: 'protanopia' | 'deuteranopia' | 'tritanopia';
}

export interface UserProgress {
  totalCoursesEnrolled: number;
  totalCoursesCompleted: number;
  totalHoursLearned: number;
  currentStreak: number;
  longestStreak: number;
  totalCertificates: number;
  skillsAcquired: string[];
  averageScore: number;
  lastActivityDate: Date;
}

export interface UserAchievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  earnedDate: Date;
  progress?: number;
  requirement?: any;
}

export interface UserSubscription {
  type: SubscriptionType;
  startDate: Date;
  endDate?: Date;
  features: string[];
  paymentMethod?: string;
  autoRenewal: boolean;
  status: 'active' | 'expired' | 'cancelled' | 'suspended';
}

export interface User {
  id: string;
  profile: UserProfile;
  role: UserRole;
  status: UserStatus;
  preferences: UserPreferences;
  progress: UserProgress;
  achievements: UserAchievement[];
  subscription: UserSubscription;
  enrolledCourses: string[];
  createdCourses?: string[];
  favoriteTopics: string[];
  connections: string[];
  blocked: string[];
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  emailVerified: boolean;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  loginAttempts?: number;
  lockedUntil?: Date;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  profile: Pick<UserProfile, 'firstName' | 'lastName' | 'avatar'>;
  permissions: string[];
  sessionId: string;
  tokenExpiry: Date;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
  organization?: string;
  acceptTerms: boolean;
  marketingConsent?: boolean;
}

export interface UpdateUserRequest {
  profile?: Partial<UserProfile>;
  preferences?: Partial<UserPreferences>;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ResetPasswordRequest {
  email: string;
  resetToken?: string;
  newPassword?: string;
}

export interface UserSearchFilters {
  query?: string;
  role?: UserRole[];
  status?: UserStatus[];
  skills?: string[];
  location?: string;
  organization?: string;
  joinedAfter?: Date;
  joinedBefore?: Date;
}

export interface UserConnection {
  id: string;
  userId: string;
  connectedUserId: string;
  status: 'pending' | 'accepted' | 'blocked';
  initiatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserActivity {
  id: string;
  userId: string;
  type: string;
  description: string;
  metadata?: any;
  timestamp: Date;
  isPublic: boolean;
}

export interface UserNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  category: string;
  read: boolean;
  actionUrl?: string;
  actionText?: string;
  metadata?: any;
  createdAt: Date;
  expiresAt?: Date;
}

export interface UserSession {
  id: string;
  userId: string;
  deviceInfo: string;
  ipAddress: string;
  location?: string;
  userAgent: string;
  isActive: boolean;
  lastActivity: Date;
  createdAt: Date;
}

// Type guards
export function isInstructor(user: User | AuthUser): boolean {
  return user.role === UserRole.INSTRUCTOR || user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
}

export function isAdmin(user: User | AuthUser): boolean {
  return user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
}

export function isSuperAdmin(user: User | AuthUser): boolean {
  return user.role === UserRole.SUPER_ADMIN;
}

export function hasRole(user: User | AuthUser, roles: UserRole[]): boolean {
  return roles.includes(user.role);
}

export function canCreateCourse(user: User | AuthUser): boolean {
  return isInstructor(user);
}

export function canManageUsers(user: User | AuthUser): boolean {
  return isAdmin(user);
}

export function canAccessAnalytics(user: User | AuthUser): boolean {
  return isInstructor(user);
}