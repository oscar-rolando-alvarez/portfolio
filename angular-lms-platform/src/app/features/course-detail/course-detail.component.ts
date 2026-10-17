import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';

import { AuthStore } from '@core/auth.store';
import { CatalogService } from '@core/catalog.service';
import { Lesson, courseDuration, formatDuration } from '@core/models';
import { ProgressStore, completionPercent, nextLessonId } from '@core/progress.store';

const LESSON_ICON: Record<Lesson['kind'], string> = {
  video: 'play_circle',
  reading: 'article',
  quiz: 'quiz',
};

@Component({
  selector: 'app-course-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatListModule, MatProgressBarModule],
  template: `
    @if (catalog.courses.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    } @else if (course(); as c) {
      <a mat-button routerLink="/"><mat-icon>arrow_back</mat-icon> Catalog</a>
      <header class="hero">
        <p class="eyebrow">{{ c.category }} - {{ c.level }}</p>
        <h1>{{ c.title }}</h1>
        <p class="lead">{{ c.subtitle }}</p>
        <p class="meta">
          Instructor: {{ c.instructor }} - {{ duration() }} - {{ c.lessons.length }} lessons
        </p>

        @if (enrolled()) {
          <div class="progress">
            <mat-progress-bar mode="determinate" [value]="percent()" aria-label="Course progress" />
            <span>{{ percent() }}% complete</span>
          </div>
          <a mat-flat-button [routerLink]="['/courses', c.id, 'lessons', resumeLessonId()]">
            {{
              percent() === 0 ? 'Start course' : percent() === 100 ? 'Review course' : 'Continue'
            }}
          </a>
        } @else {
          <button mat-flat-button type="button" (click)="enroll()">
            {{ auth.isSignedIn() ? 'Enroll for free' : 'Sign in to enroll' }}
          </button>
        }
      </header>

      <h2>Syllabus</h2>
      <mat-list role="list">
        @for (lesson of c.lessons; track lesson.id; let i = $index) {
          <mat-list-item role="listitem">
            <mat-icon matListItemIcon>
              {{ progress.isCompleted(c.id, lesson.id) ? 'check_circle' : icon[lesson.kind] }}
            </mat-icon>
            <span matListItemTitle>
              @if (enrolled()) {
                <a [routerLink]="['/courses', c.id, 'lessons', lesson.id]"
                  >{{ i + 1 }}. {{ lesson.title }}</a
                >
              } @else {
                {{ i + 1 }}. {{ lesson.title }}
              }
            </span>
            <span matListItemLine>{{ lesson.kind }} - {{ lesson.durationMinutes }} min</span>
          </mat-list-item>
        }
      </mat-list>
    } @else {
      <h1>Course not found</h1>
      <a mat-button routerLink="/">Back to the catalog</a>
    }
  `,
  styles: `
    .hero {
      margin: 8px 0 32px;
    }
    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.75rem;
      color: var(--mat-sys-primary);
      margin: 0;
    }
    h1 {
      margin: 4px 0;
    }
    .lead {
      font-size: 1.1rem;
      margin: 0 0 8px;
    }
    .meta {
      opacity: 0.7;
    }
    .progress {
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 420px;
      margin-bottom: 16px;
    }
    .progress mat-progress-bar {
      flex: 1;
    }
    mat-list a {
      color: inherit;
    }
  `,
})
export class CourseDetailComponent {
  /** Bound from the `:courseId` route parameter. */
  readonly courseId = input.required<string>();

  protected readonly catalog = inject(CatalogService);
  protected readonly progress = inject(ProgressStore);
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly icon = LESSON_ICON;
  protected readonly course = computed(() => this.catalog.find(this.courseId()));
  protected readonly enrolled = computed(() => this.progress.isEnrolled(this.courseId()));
  protected readonly percent = computed(() => {
    const c = this.course();
    return c ? completionPercent(c, this.progress.enrollment(c.id)) : 0;
  });
  protected readonly resumeLessonId = computed(() => {
    const c = this.course();
    return c ? nextLessonId(c, this.progress.enrollment(c.id)) : null;
  });
  protected readonly duration = computed(() => {
    const c = this.course();
    return c ? formatDuration(courseDuration(c)) : '';
  });

  protected enroll(): void {
    if (!this.auth.isSignedIn()) {
      void this.router.navigate(['/sign-in'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.progress.enroll(this.courseId());
  }
}
