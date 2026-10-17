import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { CatalogService } from '@core/catalog.service';
import { Course, CourseLevel } from '@core/models';
import { CourseCardComponent } from '@shared/course-card.component';

export function filterCourses(
  courses: readonly Course[],
  query: string,
  level: CourseLevel | 'all',
  category: string,
): Course[] {
  const q = query.trim().toLowerCase();
  return courses.filter(
    (c) =>
      (level === 'all' || c.level === level) &&
      (category === 'all' || c.category === category) &&
      (!q ||
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))),
  );
}

@Component({
  selector: 'app-catalog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    CourseCardComponent,
  ],
  template: `
    <header>
      <h1>Course catalog</h1>
      <p class="lead">Short, practical courses with video, reading and graded quizzes.</p>
    </header>

    <section class="filters" aria-label="Filter courses">
      <mat-form-field class="search" subscriptSizing="dynamic">
        <mat-label>Search courses</mat-label>
        <input
          matInput
          type="search"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>
      <mat-button-toggle-group
        [value]="level()"
        (change)="level.set($event.value)"
        aria-label="Level"
        hideSingleSelectionIndicator
      >
        <mat-button-toggle value="all">All levels</mat-button-toggle>
        <mat-button-toggle value="beginner">Beginner</mat-button-toggle>
        <mat-button-toggle value="intermediate">Intermediate</mat-button-toggle>
        <mat-button-toggle value="advanced">Advanced</mat-button-toggle>
      </mat-button-toggle-group>
      <mat-button-toggle-group
        [value]="category()"
        (change)="category.set($event.value)"
        aria-label="Category"
        hideSingleSelectionIndicator
      >
        <mat-button-toggle value="all">All topics</mat-button-toggle>
        @for (c of catalog.categories(); track c) {
          <mat-button-toggle [value]="c">{{ c }}</mat-button-toggle>
        }
      </mat-button-toggle-group>
    </section>

    @if (catalog.courses.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    } @else if (catalog.courses.error()) {
      <p role="alert">The catalog could not be loaded. Please refresh the page.</p>
    } @else {
      <p class="count" aria-live="polite">
        {{ results().length }} of {{ catalog.courses.value().length }} courses
      </p>
      <div class="grid">
        @for (course of results(); track course.id) {
          <app-course-card [course]="course" />
        } @empty {
          <p>No courses match your filters.</p>
        }
      </div>
    }
  `,
  styles: `
    h1 {
      margin-bottom: 4px;
    }
    .lead {
      margin-top: 0;
      opacity: 0.75;
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      margin: 24px 0 8px;
    }
    .search {
      flex: 1 1 260px;
    }
    .count {
      font-size: 0.85rem;
      opacity: 0.7;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }
  `,
})
export class CatalogComponent {
  protected readonly catalog = inject(CatalogService);

  protected readonly query = signal('');
  protected readonly level = signal<CourseLevel | 'all'>('all');
  protected readonly category = signal('all');

  protected readonly results = computed(() =>
    filterCourses(this.catalog.courses.value(), this.query(), this.level(), this.category()),
  );
}
