export enum CourseLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert'
}

export enum CourseStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
  SUSPENDED = 'suspended'
}

export enum CourseType {
  SELF_PACED = 'self_paced',
  INSTRUCTOR_LED = 'instructor_led',
  BLENDED = 'blended',
  LIVE = 'live'
}

export enum EnrollmentStatus {
  NOT_ENROLLED = 'not_enrolled',
  ENROLLED = 'enrolled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SUSPENDED = 'suspended',
  EXPIRED = 'expired'
}

export enum ContentType {
  VIDEO = 'video',
  DOCUMENT = 'document',
  AUDIO = 'audio',
  QUIZ = 'quiz',
  ASSIGNMENT = 'assignment',
  DISCUSSION = 'discussion',
  SCORM = 'scorm',
  INTERACTIVE = 'interactive',
  LIVE_SESSION = 'live_session'
}

export interface CourseMetadata {
  id: string;
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  thumbnail: string;
  banner?: string;
  level: CourseLevel;
  category: string;
  subcategory?: string;
  tags: string[];
  language: string;
  duration: number; // in minutes
  estimatedEffort: string;
  instructorId: string;
  instructorName: string;
  instructorAvatar?: string;
  coInstructors?: string[];
  price: number;
  currency: string;
  discountPrice?: number;
  isFree: boolean;
  isPremium: boolean;
  requiresApproval: boolean;
  maxStudents?: number;
  prerequisites: string[];
  learningObjectives: string[];
  targetAudience: string[];
  skillsGained: string[];
  certificateAvailable: boolean;
  rating: number;
  totalReviews: number;
  totalStudents: number;
  status: CourseStatus;
  type: CourseType;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  lastModified: Date;
}

export interface CourseSection {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  order: number;
  isPublished: boolean;
  estimatedDuration: number;
  lessons: CourseLesson[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseLesson {
  id: string;
  sectionId: string;
  title: string;
  description?: string;
  type: ContentType;
  content: LessonContent;
  order: number;
  duration: number;
  isPreview: boolean;
  isRequired: boolean;
  isPublished: boolean;
  resources: LessonResource[];
  quiz?: string; // Quiz ID
  assignment?: string; // Assignment ID
  discussionEnabled: boolean;
  notesEnabled: boolean;
  downloadable: boolean;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface LessonContent {
  id: string;
  type: ContentType;
  url?: string;
  text?: string;
  html?: string;
  videoMetadata?: VideoMetadata;
  documentMetadata?: DocumentMetadata;
  audioMetadata?: AudioMetadata;
  scormMetadata?: ScormMetadata;
  interactiveMetadata?: InteractiveMetadata;
}

export interface VideoMetadata {
  duration: number;
  quality: string[];
  subtitles: Subtitle[];
  chapters: VideoChapter[];
  thumbnail: string;
  resolution: string;
  format: string;
  size: number;
  streamingUrl: string;
  downloadUrl?: string;
  transcriptUrl?: string;
}

export interface Subtitle {
  language: string;
  url: string;
  isDefault: boolean;
}

export interface VideoChapter {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  thumbnail?: string;
}

export interface DocumentMetadata {
  filename: string;
  size: number;
  mimeType: string;
  pages?: number;
  downloadUrl: string;
  viewerUrl?: string;
  thumbnailUrl?: string;
}

export interface AudioMetadata {
  duration: number;
  format: string;
  bitrate: number;
  size: number;
  transcript?: string;
}

export interface ScormMetadata {
  version: string;
  launchUrl: string;
  manifestUrl: string;
  completionThreshold?: number;
  mastery?: number;
}

export interface InteractiveMetadata {
  type: string;
  configUrl: string;
  dataUrl?: string;
  width?: number;
  height?: number;
}

export interface LessonResource {
  id: string;
  title: string;
  description?: string;
  type: string;
  url: string;
  downloadable: boolean;
  size?: number;
  format?: string;
}

export interface CourseProgress {
  courseId: string;
  userId: string;
  enrollmentStatus: EnrollmentStatus;
  enrollmentDate: Date;
  startDate?: Date;
  completionDate?: Date;
  lastAccessedDate?: Date;
  progressPercentage: number;
  completedLessons: string[];
  currentLesson?: string;
  totalTimeSpent: number; // in minutes
  sectionsProgress: SectionProgress[];
  certificateEarned: boolean;
  certificateId?: string;
  notes: StudentNote[];
  bookmarks: StudentBookmark[];
  metadata?: any;
}

export interface SectionProgress {
  sectionId: string;
  completedLessons: string[];
  progressPercentage: number;
  timeSpent: number;
  lastAccessed?: Date;
}

export interface StudentNote {
  id: string;
  lessonId: string;
  content: string;
  timestamp?: number; // For video notes
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentBookmark {
  id: string;
  lessonId: string;
  title: string;
  timestamp?: number; // For video bookmarks
  notes?: string;
  createdAt: Date;
}

export interface CourseEnrollment {
  id: string;
  courseId: string;
  userId: string;
  status: EnrollmentStatus;
  enrollmentDate: Date;
  completionDate?: Date;
  progress: number;
  grade?: number;
  certificateId?: string;
  paymentId?: string;
  accessExpiry?: Date;
  metadata?: any;
}

export interface CourseReview {
  id: string;
  courseId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  title: string;
  comment: string;
  isVerifiedPurchase: boolean;
  isHelpful: number;
  isReported: boolean;
  instructorReply?: InstructorReply;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstructorReply {
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseAnnouncement {
  id: string;
  courseId: string;
  title: string;
  content: string;
  isImportant: boolean;
  createdAt: Date;
  readBy: string[];
}

export interface CourseFAQ {
  id: string;
  courseId: string;
  question: string;
  answer: string;
  order: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseAnalytics {
  courseId: string;
  totalEnrollments: number;
  activeStudents: number;
  completionRate: number;
  averageRating: number;
  totalRevenue: number;
  engagementMetrics: EngagementMetrics;
  progressDistribution: ProgressDistribution;
  popularLessons: LessonPopularity[];
  dropoffPoints: DropoffPoint[];
  timeMetrics: TimeMetrics;
  geographicDistribution: GeographicData[];
  deviceDistribution: DeviceData[];
}

export interface EngagementMetrics {
  averageTimeSpent: number;
  averageSessionDuration: number;
  returnRate: number;
  forumParticipation: number;
  assignmentSubmissionRate: number;
  quizCompletionRate: number;
}

export interface ProgressDistribution {
  notStarted: number;
  inProgress: number;
  completed: number;
  averageProgress: number;
}

export interface LessonPopularity {
  lessonId: string;
  lessonTitle: string;
  views: number;
  completions: number;
  averageTimeSpent: number;
  dropoffRate: number;
}

export interface DropoffPoint {
  lessonId: string;
  lessonTitle: string;
  dropoffRate: number;
  timestamp?: number; // For video content
}

export interface TimeMetrics {
  averageCompletionTime: number;
  fastestCompletion: number;
  slowestCompletion: number;
  peakLearningHours: number[];
  weeklyActivity: WeeklyActivity[];
}

export interface WeeklyActivity {
  week: string;
  enrollments: number;
  completions: number;
  activeUsers: number;
}

export interface GeographicData {
  country: string;
  students: number;
  completionRate: number;
}

export interface DeviceData {
  device: string;
  percentage: number;
  completionRate: number;
}

export interface CreateCourseRequest {
  title: string;
  description: string;
  shortDescription: string;
  level: CourseLevel;
  category: string;
  subcategory?: string;
  tags: string[];
  language: string;
  price: number;
  currency: string;
  isFree: boolean;
  thumbnail?: File;
  banner?: File;
  prerequisites: string[];
  learningObjectives: string[];
  targetAudience: string[];
  skillsGained: string[];
}

export interface UpdateCourseRequest {
  metadata?: Partial<CourseMetadata>;
  sections?: CourseSection[];
}

export interface CourseSearchFilters {
  query?: string;
  category?: string[];
  subcategory?: string[];
  level?: CourseLevel[];
  language?: string[];
  price?: 'free' | 'paid' | 'any';
  duration?: 'short' | 'medium' | 'long';
  rating?: number;
  instructorId?: string;
  tags?: string[];
  sortBy?: 'relevance' | 'popularity' | 'rating' | 'newest' | 'price';
  sortOrder?: 'asc' | 'desc';
}

export interface Course {
  metadata: CourseMetadata;
  sections: CourseSection[];
  analytics?: CourseAnalytics;
  reviews?: CourseReview[];
  announcements?: CourseAnnouncement[];
  faqs?: CourseFAQ[];
}

// Type guards and utility functions
export function isPublishedCourse(course: Course): boolean {
  return course.metadata.status === CourseStatus.PUBLISHED;
}

export function isPaidCourse(course: Course): boolean {
  return !course.metadata.isFree && course.metadata.price > 0;
}

export function canEnrollInCourse(course: Course, userRole: string): boolean {
  if (course.metadata.status !== CourseStatus.PUBLISHED) return false;
  if (course.metadata.requiresApproval && userRole === 'student') return false;
  if (course.metadata.maxStudents && course.metadata.totalStudents >= course.metadata.maxStudents) return false;
  return true;
}

export function calculateCourseProgress(progress: CourseProgress): number {
  if (!progress.sectionsProgress.length) return 0;
  
  const totalSections = progress.sectionsProgress.length;
  const totalProgress = progress.sectionsProgress.reduce(
    (sum, section) => sum + section.progressPercentage, 
    0
  );
  
  return Math.round(totalProgress / totalSections);
}

export function formatCourseDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

export function getCourseCompletionBadge(completionRate: number): string {
  if (completionRate >= 90) return 'Excellent';
  if (completionRate >= 70) return 'Good';
  if (completionRate >= 50) return 'Average';
  return 'Needs Improvement';
}