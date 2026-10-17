import { Course, QuizLesson } from '@core/models';

export const QUIZ: QuizLesson = {
  id: 'q-1',
  kind: 'quiz',
  title: 'Quiz',
  durationMinutes: 5,
  passingScore: 70,
  questions: [
    { id: 'a', prompt: 'One?', options: ['x', 'y'], answer: 0 },
    { id: 'b', prompt: 'Two?', options: ['x', 'y'], answer: 1 },
    { id: 'c', prompt: 'Three?', options: ['x', 'y'], answer: 1 },
  ],
};

export const COURSE: Course = {
  id: 'c-1',
  title: 'Testing Angular',
  subtitle: 'Fast feedback with Vitest',
  category: 'Frontend',
  level: 'beginner',
  instructor: 'Test Instructor',
  tags: ['Testing', 'Vitest'],
  lessons: [
    { id: 'l-1', kind: 'reading', title: 'Intro', durationMinutes: 50, paragraphs: ['Hello'] },
    {
      id: 'l-2',
      kind: 'video',
      title: 'Video',
      durationMinutes: 20,
      videoUrl: 'about:blank',
      summary: 'Summary',
    },
    QUIZ,
  ],
};

export const OTHER_COURSE: Course = {
  ...COURSE,
  id: 'c-2',
  title: 'Cloud Basics',
  subtitle: 'Resilient systems',
  category: 'Architecture',
  level: 'advanced',
  tags: ['Cloud'],
};
