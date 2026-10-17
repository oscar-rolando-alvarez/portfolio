export type CourseLevel = 'beginner' | 'intermediate' | 'advanced';

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  /** Index into `options` of the correct answer. */
  answer: number;
  explanation?: string;
}

interface LessonBase {
  id: string;
  title: string;
  durationMinutes: number;
}

export interface VideoLesson extends LessonBase {
  kind: 'video';
  videoUrl: string;
  summary: string;
}

export interface ReadingLesson extends LessonBase {
  kind: 'reading';
  paragraphs: string[];
}

export interface QuizLesson extends LessonBase {
  kind: 'quiz';
  /** Minimum score (0-100) required to complete the lesson. */
  passingScore: number;
  questions: QuizQuestion[];
}

export type Lesson = VideoLesson | ReadingLesson | QuizLesson;

export interface Course {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  level: CourseLevel;
  instructor: string;
  tags: string[];
  lessons: Lesson[];
}

export interface QuizResult {
  score: number;
  correct: number;
  total: number;
  passed: boolean;
}

/** Grades a quiz attempt. Unanswered questions count as incorrect. */
export function gradeQuiz(quiz: QuizLesson, answers: Readonly<Record<string, number>>): QuizResult {
  const total = quiz.questions.length;
  const correct = quiz.questions.filter((q) => answers[q.id] === q.answer).length;
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { score, correct, total, passed: score >= quiz.passingScore };
}

export function courseDuration(course: Course): number {
  return course.lessons.reduce((sum, l) => sum + l.durationMinutes, 0);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}
