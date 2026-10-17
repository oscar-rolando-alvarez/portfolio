import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';

import { Course, courseDuration, formatDuration } from '@core/models';

@Component({
  selector: 'app-course-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatCardModule, MatChipsModule, MatIconModule, MatProgressBarModule],
  template: `
    <mat-card appearance="outlined" class="card">
      <a class="link" [routerLink]="['/courses', course().id]">
        <mat-card-header>
          <mat-card-title>{{ course().title }}</mat-card-title>
          <mat-card-subtitle>{{ course().category }} - {{ course().level }}</mat-card-subtitle>
        </mat-card-header>
      </a>
      <mat-card-content>
        <p>{{ course().subtitle }}</p>
        <div class="meta">
          <span><mat-icon inline>schedule</mat-icon> {{ duration() }}</span>
          <span><mat-icon inline>menu_book</mat-icon> {{ course().lessons.length }} lessons</span>
        </div>
        <mat-chip-set aria-label="Tags">
          @for (tag of course().tags; track tag) {
            <mat-chip disableRipple>{{ tag }}</mat-chip>
          }
        </mat-chip-set>
      </mat-card-content>
      @if (progress() !== null) {
        <mat-card-footer>
          <mat-progress-bar
            mode="determinate"
            [value]="progress()"
            [attr.aria-label]="'Progress ' + progress() + '%'"
          />
          <span class="progress-label">{{ progress() }}% complete</span>
        </mat-card-footer>
      }
    </mat-card>
  `,
  styles: `
    .card {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .link {
      color: inherit;
      text-decoration: none;
    }
    .link:hover mat-card-title,
    .link:focus-visible mat-card-title {
      text-decoration: underline;
    }
    mat-card-content {
      flex: 1;
    }
    .meta {
      display: flex;
      gap: 16px;
      margin: 8px 0 12px;
      font-size: 0.85rem;
      opacity: 0.8;
    }
    mat-card-footer {
      padding: 0 16px 12px;
    }
    .progress-label {
      font-size: 0.8rem;
      opacity: 0.8;
    }
  `,
})
export class CourseCardComponent {
  readonly course = input.required<Course>();
  /** Completion percentage; `null` hides the progress footer. */
  readonly progress = input<number | null>(null);

  protected readonly duration = computed(() => formatDuration(courseDuration(this.course())));
}
