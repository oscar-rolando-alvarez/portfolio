import { httpResource } from '@angular/common/http';
import { Injectable, computed } from '@angular/core';

import { Course } from './models';

/** Course catalog loaded once from a static JSON document served alongside the app. */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  readonly courses = httpResource<Course[]>(() => 'data/courses.json', { defaultValue: [] });

  readonly categories = computed(() =>
    [...new Set(this.courses.value().map((c) => c.category))].sort(),
  );

  private readonly byId = computed(() => new Map(this.courses.value().map((c) => [c.id, c])));

  find(id: string): Course | undefined {
    return this.byId().get(id);
  }
}
