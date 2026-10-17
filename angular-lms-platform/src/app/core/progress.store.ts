import { computed, effect, inject, untracked } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

import { AuthStore } from './auth.store';
import { Course, QuizResult } from './models';
import { storage } from './storage';

export interface Enrollment {
  enrolledAt: string;
  completedLessonIds: string[];
  lastLessonId: string | null;
}

export interface ProgressState {
  enrollments: Record<string, Enrollment>;
  /** Best quiz score per lesson id (0-100). */
  quizScores: Record<string, number>;
}

const EMPTY: ProgressState = { enrollments: {}, quizScores: {} };

export const progressKey = (email: string) => `lms.progress.${email}`;

/** Percentage (0-100) of a course's lessons the learner has completed. */
export function completionPercent(course: Course, enrollment: Enrollment | undefined): number {
  if (!enrollment || course.lessons.length === 0) {
    return 0;
  }
  const done = course.lessons.filter((l) => enrollment.completedLessonIds.includes(l.id)).length;
  return Math.round((done / course.lessons.length) * 100);
}

/** The lesson to resume: the first incomplete one, or the first lesson when everything is done. */
export function nextLessonId(course: Course, enrollment: Enrollment | undefined): string | null {
  const next = course.lessons.find((l) => !enrollment?.completedLessonIds.includes(l.id));
  return (next ?? course.lessons[0])?.id ?? null;
}

/**
 * Learner progress, scoped to the signed-in learner and persisted per learner in
 * localStorage. Built with NgRx SignalStore: state is a signal, updates go
 * through `patchState`, and persistence is a plain `effect`.
 */
export const ProgressStore = signalStore(
  { providedIn: 'root' },
  withState<ProgressState>(EMPTY),
  withComputed(({ enrollments }) => ({
    enrolledCourseIds: computed(() => Object.keys(enrollments())),
  })),
  withMethods((store) => {
    function completeLesson(courseId: string, lessonId: string): void {
      const current = store.enrollments()[courseId];
      if (!current || current.completedLessonIds.includes(lessonId)) {
        return;
      }
      patchState(store, ({ enrollments }) => ({
        enrollments: {
          ...enrollments,
          [courseId]: { ...current, completedLessonIds: [...current.completedLessonIds, lessonId] },
        },
      }));
    }

    return {
      enrollment(courseId: string): Enrollment | undefined {
        return store.enrollments()[courseId];
      },
      isEnrolled(courseId: string): boolean {
        return courseId in store.enrollments();
      },
      isCompleted(courseId: string, lessonId: string): boolean {
        return store.enrollments()[courseId]?.completedLessonIds.includes(lessonId) ?? false;
      },
      enroll(courseId: string): void {
        if (courseId in store.enrollments()) {
          return;
        }
        patchState(store, ({ enrollments }) => ({
          enrollments: {
            ...enrollments,
            [courseId]: {
              enrolledAt: new Date().toISOString(),
              completedLessonIds: [],
              lastLessonId: null,
            },
          },
        }));
      },
      visitLesson(courseId: string, lessonId: string): void {
        const current = store.enrollments()[courseId];
        if (!current || current.lastLessonId === lessonId) {
          return;
        }
        patchState(store, ({ enrollments }) => ({
          enrollments: { ...enrollments, [courseId]: { ...current, lastLessonId: lessonId } },
        }));
      },
      completeLesson,
      recordQuiz(courseId: string, lessonId: string, result: QuizResult): void {
        const best = Math.max(store.quizScores()[lessonId] ?? 0, result.score);
        patchState(store, ({ quizScores }) => ({
          quizScores: { ...quizScores, [lessonId]: best },
        }));
        if (result.passed) {
          completeLesson(courseId, lessonId);
        }
      },
      unenroll(courseId: string): void {
        patchState(store, ({ enrollments }) => {
          const rest = { ...enrollments };
          delete rest[courseId];
          return { enrollments: rest };
        });
      },
    };
  }),
  withHooks((store) => {
    const auth = inject(AuthStore);
    return {
      onInit() {
        // Load the signed-in learner's progress whenever the learner changes.
        effect(() => {
          const learner = auth.learner();
          untracked(() =>
            patchState(
              store,
              learner ? (storage.read<ProgressState>(progressKey(learner.email)) ?? EMPTY) : EMPTY,
            ),
          );
        });
        // Persist every change for the current learner.
        effect(() => {
          const snapshot: ProgressState = {
            enrollments: store.enrollments(),
            quizScores: store.quizScores(),
          };
          const learner = untracked(auth.learner);
          if (learner) {
            storage.write(progressKey(learner.email), snapshot);
          }
        });
      },
    };
  }),
);
