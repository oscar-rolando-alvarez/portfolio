import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { COURSE, OTHER_COURSE } from '../../testing/fixtures';
import { CatalogComponent, filterCourses } from './catalog.component';

describe('filterCourses', () => {
  const courses = [COURSE, OTHER_COURSE];

  it('matches title, subtitle and tags case-insensitively', () => {
    expect(filterCourses(courses, 'VITEST', 'all', 'all')).toEqual([COURSE]);
    expect(filterCourses(courses, 'cloud', 'all', 'all')).toEqual([OTHER_COURSE]);
  });

  it('filters by level and category', () => {
    expect(filterCourses(courses, '', 'advanced', 'all')).toEqual([OTHER_COURSE]);
    expect(filterCourses(courses, '', 'all', 'Frontend')).toEqual([COURSE]);
    expect(filterCourses(courses, '', 'beginner', 'Architecture')).toEqual([]);
  });
});

describe('CatalogComponent', () => {
  it('renders a card per course loaded from the catalog document', async () => {
    TestBed.configureTestingModule({
      imports: [CatalogComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(CatalogComponent);
    fixture.detectChanges();

    TestBed.inject(HttpTestingController)
      .expectOne('data/courses.json')
      .flush([COURSE, OTHER_COURSE]);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const titles = [...el.querySelectorAll('mat-card-title')].map((t) => t.textContent?.trim());
    expect(titles).toEqual([COURSE.title, OTHER_COURSE.title]);
    expect(el.querySelector('.count')?.textContent).toContain('2 of 2 courses');
  });
});
