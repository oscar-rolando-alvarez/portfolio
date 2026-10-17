import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { AuthStore } from '@core/auth.store';
import { CatalogService } from '@core/catalog.service';
import { ProgressStore, completionPercent } from '@core/progress.store';
import { CourseCardComponent } from '@shared/course-card.component';

@Component({
  selector: 'app-my-learning',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, CourseCardComponent],
  template: `
    <h1>My learning</h1>
    <p class="lead">Welcome back, {{ auth.learner()?.name }}.</p>

    <section class="stats" aria-label="Learning summary">
      <div>
        <strong>{{ items().length }}</strong
        ><span>enrolled</span>
      </div>
      <div>
        <strong>{{ completedCount() }}</strong
        ><span>completed</span>
      </div>
      <div>
        <strong>{{ average() }}%</strong><span>average progress</span>
      </div>
    </section>

    <div class="grid">
      @for (item of items(); track item.course.id) {
        <app-course-card [course]="item.course" [progress]="item.percent" />
      } @empty {
        <p>You have not enrolled in any course yet.</p>
        <a mat-flat-button routerLink="/">Browse the catalog</a>
      }
    </div>
  `,
  styles: `
    .lead {
      opacity: 0.75;
    }
    .stats {
      display: flex;
      gap: 32px;
      margin: 16px 0 24px;
    }
    .stats div {
      display: flex;
      flex-direction: column;
    }
    .stats strong {
      font-size: 1.75rem;
    }
    .stats span {
      font-size: 0.8rem;
      opacity: 0.7;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }
  `,
})
export class MyLearningComponent {
  protected readonly auth = inject(AuthStore);
  private readonly catalog = inject(CatalogService);
  private readonly progress = inject(ProgressStore);

  protected readonly items = computed(() =>
    this.progress
      .enrolledCourseIds()
      .map((id) => this.catalog.find(id))
      .filter((course) => course !== undefined)
      .map((course) => ({
        course,
        percent: completionPercent(course, this.progress.enrollment(course.id)),
      })),
  );
  protected readonly completedCount = computed(
    () => this.items().filter((i) => i.percent === 100).length,
  );
  protected readonly average = computed(() => {
    const list = this.items();
    return list.length ? Math.round(list.reduce((sum, i) => sum + i.percent, 0) / list.length) : 0;
  });
}
