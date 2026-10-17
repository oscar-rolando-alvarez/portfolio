import { TestBed } from '@angular/core/testing';

import { COURSE } from '../testing/fixtures';
import { AuthStore } from './auth.store';
import { ProgressStore, completionPercent, nextLessonId, progressKey } from './progress.store';

describe('ProgressStore', () => {
  const learner = { name: 'Ada Lovelace', email: 'ada@example.com' };

  function setup() {
    const auth = TestBed.inject(AuthStore);
    auth.signIn(learner);
    const progress = TestBed.inject(ProgressStore);
    TestBed.tick();
    return { auth, progress };
  }

  beforeEach(() => localStorage.clear());

  it('enrolls, completes lessons and reports completion', () => {
    const { progress } = setup();

    progress.enroll(COURSE.id);
    expect(progress.isEnrolled(COURSE.id)).toBe(true);
    expect(nextLessonId(COURSE, progress.enrollment(COURSE.id))).toBe('l-1');

    progress.completeLesson(COURSE.id, 'l-1');
    progress.completeLesson(COURSE.id, 'l-1'); // idempotent
    expect(progress.enrollment(COURSE.id)?.completedLessonIds).toEqual(['l-1']);
    expect(completionPercent(COURSE, progress.enrollment(COURSE.id))).toBe(33);
    expect(nextLessonId(COURSE, progress.enrollment(COURSE.id))).toBe('l-2');
  });

  it('completes a quiz lesson only when the attempt passes and keeps the best score', () => {
    const { progress } = setup();
    progress.enroll(COURSE.id);

    progress.recordQuiz(COURSE.id, 'q-1', { score: 33, correct: 1, total: 3, passed: false });
    expect(progress.isCompleted(COURSE.id, 'q-1')).toBe(false);

    progress.recordQuiz(COURSE.id, 'q-1', { score: 100, correct: 3, total: 3, passed: true });
    progress.recordQuiz(COURSE.id, 'q-1', { score: 67, correct: 2, total: 3, passed: false });
    expect(progress.isCompleted(COURSE.id, 'q-1')).toBe(true);
    expect(progress.quizScores()['q-1']).toBe(100);
  });

  it('persists progress per learner and clears it on sign-out', () => {
    const { auth, progress } = setup();
    progress.enroll(COURSE.id);
    TestBed.tick();

    const saved = JSON.parse(localStorage.getItem(progressKey(learner.email))!);
    expect(Object.keys(saved.enrollments)).toEqual([COURSE.id]);

    auth.signOut();
    TestBed.tick();
    expect(progress.enrolledCourseIds()).toEqual([]);

    auth.signIn(learner);
    TestBed.tick();
    expect(progress.isEnrolled(COURSE.id)).toBe(true);
  });

  it('ignores lesson updates for courses the learner is not enrolled in', () => {
    const { progress } = setup();
    progress.completeLesson(COURSE.id, 'l-1');
    expect(progress.isEnrolled(COURSE.id)).toBe(false);
  });
});
