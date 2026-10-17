import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';

import { CatalogService } from '@core/catalog.service';
import { QuizResult } from '@core/models';
import { ProgressStore, completionPercent } from '@core/progress.store';
import { QuizComponent } from './quiz.component';

@Component({
  selector: 'app-lesson',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    QuizComponent,
  ],
  template: `
    @if (course(); as c) {
      @if (!progress.isEnrolled(c.id)) {
        <h1>{{ c.title }}</h1>
        <p>Enroll in this course to access its lessons.</p>
        <a mat-flat-button [routerLink]="['/courses', c.id]">Go to course page</a>
      } @else if (lesson(); as l) {
        <div class="layout">
          <aside class="outline" aria-label="Course outline">
            <a mat-button [routerLink]="['/courses', c.id]"
              ><mat-icon>arrow_back</mat-icon> {{ c.title }}</a
            >
            <mat-progress-bar mode="determinate" [value]="percent()" aria-label="Course progress" />
            <mat-nav-list>
              @for (item of c.lessons; track item.id) {
                <a
                  mat-list-item
                  [routerLink]="['/courses', c.id, 'lessons', item.id]"
                  [activated]="item.id === l.id"
                  [attr.aria-current]="item.id === l.id ? 'page' : null"
                >
                  <mat-icon matListItemIcon>
                    {{
                      progress.isCompleted(c.id, item.id)
                        ? 'check_circle'
                        : 'radio_button_unchecked'
                    }}
                  </mat-icon>
                  <span matListItemTitle>{{ item.title }}</span>
                </a>
              }
            </mat-nav-list>
          </aside>

          <article class="lesson">
            <p class="eyebrow">{{ l.kind }} - {{ l.durationMinutes }} min</p>
            <h1>{{ l.title }}</h1>

            @switch (l.kind) {
              @case ('video') {
                <video
                  class="video"
                  controls
                  preload="metadata"
                  [src]="l.videoUrl"
                  (ended)="markComplete()"
                >
                  Your browser does not support HTML5 video.
                </video>
                <p>{{ l.summary }}</p>
              }
              @case ('reading') {
                @for (p of l.paragraphs; track $index) {
                  <p>{{ p }}</p>
                }
              }
              @case ('quiz') {
                <app-quiz [quiz]="l" (graded)="onGraded($event)" />
              }
            }

            <footer class="actions">
              @if (l.kind !== 'quiz') {
                @if (completed()) {
                  <span class="done"><mat-icon>check_circle</mat-icon> Completed</span>
                } @else {
                  <button mat-stroked-button type="button" (click)="markComplete()">
                    Mark as complete
                  </button>
                }
              }
              <span class="spacer"></span>
              @if (previousId(); as prev) {
                <a mat-button [routerLink]="['/courses', c.id, 'lessons', prev]">Previous</a>
              }
              @if (nextId(); as next) {
                <a mat-flat-button [routerLink]="['/courses', c.id, 'lessons', next]"
                  >Next lesson</a
                >
              } @else {
                <a mat-flat-button routerLink="/my-learning">Finish</a>
              }
            </footer>
          </article>
        </div>
      } @else {
        <h1>Lesson not found</h1>
        <a mat-button [routerLink]="['/courses', c.id]">Back to the course</a>
      }
    } @else if (catalog.courses.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    } @else {
      <h1>Course not found</h1>
      <a mat-button routerLink="/">Back to the catalog</a>
    }
  `,
  styles: `
    .layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 32px;
    }
    .outline mat-progress-bar {
      margin: 8px 0;
    }
    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.75rem;
      color: var(--mat-sys-primary);
      margin: 0;
    }
    h1 {
      margin-top: 4px;
    }
    .video {
      width: 100%;
      aspect-ratio: 16 / 9;
      border-radius: 12px;
      background: #000;
    }
    .lesson p {
      line-height: 1.6;
      max-width: 70ch;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 32px;
    }
    .spacer {
      flex: 1;
    }
    .done {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--mat-sys-primary);
    }
    @media (max-width: 840px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .outline mat-nav-list {
        display: none;
      }
    }
  `,
})
export class LessonComponent {
  readonly courseId = input.required<string>();
  readonly lessonId = input.required<string>();

  protected readonly catalog = inject(CatalogService);
  protected readonly progress = inject(ProgressStore);

  protected readonly course = computed(() => this.catalog.find(this.courseId()));
  protected readonly index = computed(
    () => this.course()?.lessons.findIndex((l) => l.id === this.lessonId()) ?? -1,
  );
  protected readonly lesson = computed(() => this.course()?.lessons[this.index()]);
  protected readonly previousId = computed(
    () => this.course()?.lessons[this.index() - 1]?.id ?? null,
  );
  protected readonly nextId = computed(() => this.course()?.lessons[this.index() + 1]?.id ?? null);
  protected readonly completed = computed(() =>
    this.progress.isCompleted(this.courseId(), this.lessonId()),
  );
  protected readonly percent = computed(() => {
    const c = this.course();
    return c ? completionPercent(c, this.progress.enrollment(c.id)) : 0;
  });

  constructor() {
    // Remember the last visited lesson so "Continue" can resume here.
    effect(() => {
      const courseId = this.courseId();
      const lessonId = this.lesson()?.id;
      if (lessonId) {
        untracked(() => this.progress.visitLesson(courseId, lessonId));
      }
    });
  }

  protected markComplete(): void {
    this.progress.completeLesson(this.courseId(), this.lessonId());
  }

  protected onGraded(result: QuizResult): void {
    this.progress.recordQuiz(this.courseId(), this.lessonId(), result);
  }
}
