import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';

import { AuthStore } from '@core/auth.store';

/** Learner-only pages redirect to sign-in and come back afterwards. */
export const signedInGuard: CanActivateFn = (_route, state) =>
  inject(AuthStore).isSignedIn() ||
  inject(Router).createUrlTree(['/sign-in'], { queryParams: { returnUrl: state.url } });

export const routes: Routes = [
  {
    path: '',
    title: 'Course catalog | LMS',
    loadComponent: () =>
      import('@features/catalog/catalog.component').then((m) => m.CatalogComponent),
  },
  {
    path: 'courses/:courseId',
    title: 'Course | LMS',
    loadComponent: () =>
      import('@features/course-detail/course-detail.component').then(
        (m) => m.CourseDetailComponent,
      ),
  },
  {
    path: 'courses/:courseId/lessons/:lessonId',
    title: 'Lesson | LMS',
    canActivate: [signedInGuard],
    loadComponent: () => import('@features/lesson/lesson.component').then((m) => m.LessonComponent),
  },
  {
    path: 'my-learning',
    title: 'My learning | LMS',
    canActivate: [signedInGuard],
    loadComponent: () =>
      import('@features/my-learning/my-learning.component').then((m) => m.MyLearningComponent),
  },
  {
    path: 'sign-in',
    title: 'Sign in | LMS',
    loadComponent: () =>
      import('@features/sign-in/sign-in.component').then((m) => m.SignInComponent),
  },
  {
    path: '**',
    title: 'Not found | LMS',
    loadComponent: () => import('@shared/not-found.component').then((m) => m.NotFoundComponent),
  },
];
