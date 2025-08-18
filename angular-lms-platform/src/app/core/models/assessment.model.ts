export enum AssessmentType {
  QUIZ = 'quiz',
  ASSIGNMENT = 'assignment',
  EXAM = 'exam',
  PROJECT = 'project',
  PEER_REVIEW = 'peer_review',
  SELF_ASSESSMENT = 'self_assessment',
  PRACTICAL = 'practical'
}

export enum QuestionType {
  MULTIPLE_CHOICE = 'multiple_choice',
  SINGLE_CHOICE = 'single_choice',
  TRUE_FALSE = 'true_false',
  SHORT_ANSWER = 'short_answer',
  ESSAY = 'essay',
  CODE = 'code',
  DRAG_DROP = 'drag_drop',
  MATCHING = 'matching',
  ORDERING = 'ordering',
  FILL_BLANKS = 'fill_blanks',
  HOTSPOT = 'hotspot',
  AUDIO_RESPONSE = 'audio_response',
  VIDEO_RESPONSE = 'video_response',
  FILE_UPLOAD = 'file_upload'
}

export enum AssessmentStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
  SUSPENDED = 'suspended'
}

export enum SubmissionStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  SUBMITTED = 'submitted',
  GRADED = 'graded',
  RETURNED = 'returned',
  LATE = 'late',
  OVERDUE = 'overdue'
}

export enum GradingType {
  AUTO = 'auto',
  MANUAL = 'manual',
  PEER = 'peer',
  HYBRID = 'hybrid'
}

export interface AssessmentMetadata {
  id: string;
  title: string;
  description: string;
  instructions: string;
  type: AssessmentType;
  courseId?: string;
  lessonId?: string;
  instructorId: string;
  status: AssessmentStatus;
  isRequired: boolean;
  maxAttempts: number;
  timeLimit?: number; // in minutes
  passingScore: number;
  totalPoints: number;
  weight: number; // percentage of course grade
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
  showCorrectAnswers: boolean;
  showScoreImmediately: boolean;
  allowReview: boolean;
  plagiarismDetection: boolean;
  lockdownBrowser: boolean;
  webcamRequired: boolean;
  scheduledStart?: Date;
  scheduledEnd?: Date;
  lateSubmissionPenalty?: number;
  gradingType: GradingType;
  rubricId?: string;
  questionPoolIds: string[];
  tags: string[];
  difficulty: string;
  estimatedDuration: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

export interface Question {
  id: string;
  poolId?: string;
  type: QuestionType;
  title: string;
  text: string;
  explanation?: string;
  points: number;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  media?: QuestionMedia[];
  options?: QuestionOption[];
  correctAnswers: any[];
  metadata?: QuestionMetadata;
  hints?: string[];
  feedback?: QuestionFeedback;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionMedia {
  id: string;
  type: 'image' | 'audio' | 'video' | 'document';
  url: string;
  caption?: string;
  altText?: string;
  transcript?: string;
}

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation?: string;
  media?: QuestionMedia;
  order: number;
}

export interface QuestionMetadata {
  codeLanguage?: string;
  codeTemplate?: string;
  expectedOutput?: string;
  testCases?: CodeTestCase[];
  dragDropZones?: DragDropZone[];
  matchingPairs?: MatchingPair[];
  blankPositions?: BlankPosition[];
  hotspotAreas?: HotspotArea[];
  orderingItems?: OrderingItem[];
}

export interface CodeTestCase {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  weight: number;
}

export interface DragDropZone {
  id: string;
  label: string;
  acceptsItemIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MatchingPair {
  leftId: string;
  leftText: string;
  rightId: string;
  rightText: string;
  leftMedia?: QuestionMedia;
  rightMedia?: QuestionMedia;
}

export interface BlankPosition {
  id: string;
  position: number;
  acceptedAnswers: string[];
  caseSensitive: boolean;
  exactMatch: boolean;
}

export interface HotspotArea {
  id: string;
  shape: 'circle' | 'rectangle' | 'polygon';
  coordinates: number[];
  isCorrect: boolean;
  feedback?: string;
}

export interface OrderingItem {
  id: string;
  text: string;
  correctOrder: number;
  media?: QuestionMedia;
}

export interface QuestionFeedback {
  correct?: string;
  incorrect?: string;
  partial?: string;
  general?: string;
}

export interface QuestionPool {
  id: string;
  title: string;
  description: string;
  subject: string;
  difficulty: string;
  questions: Question[];
  tags: string[];
  isPublic: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Assessment {
  metadata: AssessmentMetadata;
  questions: Question[];
  rubric?: Rubric;
  settings: AssessmentSettings;
}

export interface AssessmentSettings {
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  oneQuestionPerPage: boolean;
  allowBackNavigation: boolean;
  showProgressBar: boolean;
  showQuestionNumbers: boolean;
  pauseDetection: boolean;
  fullScreenMode: boolean;
  disableCopyPaste: boolean;
  disableRightClick: boolean;
  timeWarnings: number[]; // minutes before time runs out
  autoSave: boolean;
  autoSaveInterval: number; // seconds
  browserLockdown: BrowserLockdown;
}

export interface BrowserLockdown {
  enabled: boolean;
  allowedApplications: string[];
  blockedWebsites: string[];
  disableNewTabs: boolean;
  disableIncognito: boolean;
  screenshotDetection: boolean;
  windowFocusDetection: boolean;
}

export interface AssessmentAttempt {
  id: string;
  assessmentId: string;
  userId: string;
  attemptNumber: number;
  status: SubmissionStatus;
  startTime: Date;
  endTime?: Date;
  submitTime?: Date;
  timeSpent: number; // in seconds
  responses: QuestionResponse[];
  score?: number;
  percentage?: number;
  feedback?: string;
  gradedBy?: string;
  gradedAt?: Date;
  metadata?: AttemptMetadata;
  isLate: boolean;
  violations: SecurityViolation[];
}

export interface QuestionResponse {
  questionId: string;
  response: any;
  isCorrect?: boolean;
  pointsEarned?: number;
  feedback?: string;
  timeSpent: number;
  attempts: number;
  hintsUsed: string[];
  flagged: boolean;
  confidence?: number; // 1-5 scale
}

export interface AttemptMetadata {
  ipAddress: string;
  userAgent: string;
  browserInfo: BrowserInfo;
  screenResolution: string;
  webcamSnapshots?: string[];
  keystrokeDynamics?: any[];
  mouseTracking?: any[];
  tabSwitches: number;
  windowFocusLoss: number;
  copyAttempts: number;
  pasteAttempts: number;
  rightClickAttempts: number;
}

export interface BrowserInfo {
  name: string;
  version: string;
  os: string;
  isMobile: boolean;
  isTablet: boolean;
}

export interface SecurityViolation {
  type: string;
  description: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence?: any;
}

export interface Rubric {
  id: string;
  title: string;
  description: string;
  criteria: RubricCriterion[];
  totalPoints: number;
  isPublic: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;
  levels: RubricLevel[];
}

export interface RubricLevel {
  id: string;
  name: string;
  description: string;
  points: number;
  color: string;
}

export interface GradingResult {
  attemptId: string;
  totalScore: number;
  percentage: number;
  passed: boolean;
  breakdown: QuestionGrade[];
  rubricGrades?: RubricGrade[];
  feedback: string;
  gradedBy: string;
  gradedAt: Date;
  timeToGrade: number; // in minutes
}

export interface QuestionGrade {
  questionId: string;
  pointsEarned: number;
  pointsPossible: number;
  isCorrect: boolean;
  feedback?: string;
  rubricGrade?: RubricGrade;
}

export interface RubricGrade {
  criterionId: string;
  levelId: string;
  points: number;
  feedback?: string;
}

export interface PeerReview {
  id: string;
  assessmentId: string;
  submissionId: string;
  reviewerId: string;
  revieweeId: string;
  score?: number;
  feedback: string;
  rubricGrades?: RubricGrade[];
  isAnonymous: boolean;
  isComplete: boolean;
  submittedAt: Date;
  qualityRating?: number; // Rating of the review quality
}

export interface PlagiarismResult {
  attemptId: string;
  questionId?: string;
  similarity: number;
  sources: PlagiarismSource[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  flagged: boolean;
  reviewRequired: boolean;
  checkedAt: Date;
}

export interface PlagiarismSource {
  type: 'web' | 'database' | 'student_submission';
  url?: string;
  title?: string;
  similarity: number;
  matchedText: string[];
}

export interface AssessmentAnalytics {
  assessmentId: string;
  totalAttempts: number;
  averageScore: number;
  passRate: number;
  averageTimeSpent: number;
  questionAnalytics: QuestionAnalytics[];
  difficultyDistribution: DifficultyStats;
  attemptDistribution: AttemptStats;
  timeAnalytics: TimeAnalytics;
  cheatingIndicators: CheatingStats;
  improvementSuggestions: string[];
}

export interface QuestionAnalytics {
  questionId: string;
  questionText: string;
  totalResponses: number;
  correctResponses: number;
  averageScore: number;
  averageTimeSpent: number;
  discrimination: number;
  difficulty: number;
  optionAnalysis?: OptionAnalysis[];
  commonMistakes: string[];
}

export interface OptionAnalysis {
  optionId: string;
  optionText: string;
  selectedCount: number;
  percentage: number;
  correlation: number;
}

export interface DifficultyStats {
  easy: number;
  medium: number;
  hard: number;
  averageDifficulty: number;
}

export interface AttemptStats {
  firstAttempt: number;
  secondAttempt: number;
  thirdAttempt: number;
  moreThanThree: number;
  averageAttempts: number;
}

export interface TimeAnalytics {
  averageCompletionTime: number;
  medianCompletionTime: number;
  fastestCompletion: number;
  slowestCompletion: number;
  timeoutRate: number;
  abandonmentRate: number;
}

export interface CheatingStats {
  suspiciousAttempts: number;
  flaggedForReview: number;
  similarityViolations: number;
  timeViolations: number;
  behaviorViolations: number;
  overallRiskScore: number;
}

// Request/Response interfaces
export interface CreateAssessmentRequest {
  title: string;
  description: string;
  instructions: string;
  type: AssessmentType;
  courseId?: string;
  lessonId?: string;
  timeLimit?: number;
  maxAttempts: number;
  passingScore: number;
  questions: Question[];
  settings: AssessmentSettings;
  rubricId?: string;
}

export interface UpdateAssessmentRequest {
  metadata?: Partial<AssessmentMetadata>;
  questions?: Question[];
  settings?: Partial<AssessmentSettings>;
}

export interface SubmitAssessmentRequest {
  assessmentId: string;
  responses: QuestionResponse[];
  metadata: AttemptMetadata;
}

export interface GradeAssessmentRequest {
  attemptId: string;
  grades: QuestionGrade[];
  feedback: string;
  rubricGrades?: RubricGrade[];
}

export interface AssessmentSearchFilters {
  query?: string;
  type?: AssessmentType[];
  courseId?: string;
  difficulty?: string[];
  status?: AssessmentStatus[];
  createdBy?: string;
  dateFrom?: Date;
  dateTo?: Date;
  tags?: string[];
  sortBy?: 'title' | 'created' | 'difficulty' | 'attempts';
  sortOrder?: 'asc' | 'desc';
}

// Utility functions
export function calculateAssessmentScore(attempt: AssessmentAttempt): number {
  const totalPoints = attempt.responses.reduce(
    (sum, response) => sum + (response.pointsEarned || 0), 
    0
  );
  return Math.round((totalPoints / attempt.responses.length) * 100) / 100;
}

export function calculateAssessmentPercentage(score: number, totalPoints: number): number {
  return Math.round((score / totalPoints) * 100);
}

export function isAssessmentPassed(score: number, passingScore: number): boolean {
  return score >= passingScore;
}

export function getAssessmentTimeRemaining(attempt: AssessmentAttempt, timeLimit: number): number {
  if (!timeLimit) return -1;
  
  const elapsedMinutes = Math.floor(attempt.timeSpent / 60);
  return Math.max(0, timeLimit - elapsedMinutes);
}

export function formatAssessmentDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
}

export function getAssessmentStatusColor(status: SubmissionStatus): string {
  switch (status) {
    case SubmissionStatus.NOT_STARTED: return 'default';
    case SubmissionStatus.IN_PROGRESS: return 'primary';
    case SubmissionStatus.SUBMITTED: return 'accent';
    case SubmissionStatus.GRADED: return 'success';
    case SubmissionStatus.LATE: return 'warn';
    case SubmissionStatus.OVERDUE: return 'error';
    default: return 'default';
  }
}

export function canRetakeAssessment(attempt: AssessmentAttempt, maxAttempts: number): boolean {
  return attempt.attemptNumber < maxAttempts;
}

export function getNextAttemptNumber(attempts: AssessmentAttempt[]): number {
  return attempts.length + 1;
}