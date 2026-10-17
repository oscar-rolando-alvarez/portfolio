import { TestBed } from '@angular/core/testing';

import { QuizResult } from '@core/models';
import { QUIZ } from '../../testing/fixtures';
import { QuizComponent } from './quiz.component';

describe('QuizComponent', () => {
  async function setup() {
    const fixture = TestBed.createComponent(QuizComponent);
    fixture.componentRef.setInput('quiz', QUIZ);
    const results: QuizResult[] = [];
    fixture.componentInstance.graded.subscribe((r) => results.push(r));
    await fixture.whenStable();
    return { fixture, results, el: fixture.nativeElement as HTMLElement };
  }

  function pick(el: HTMLElement, question: number, option: number): void {
    const groups = el.querySelectorAll('mat-radio-group');
    groups[question].querySelectorAll<HTMLInputElement>('input[type="radio"]')[option].click();
  }

  it('enables submit only when every question is answered', async () => {
    const { fixture, el } = await setup();
    const submit = () => el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit().disabled).toBe(true);

    pick(el, 0, 0);
    pick(el, 1, 1);
    pick(el, 2, 1);
    await fixture.whenStable();
    expect(submit().disabled).toBe(false);
  });

  it('grades the attempt and emits the result', async () => {
    const { fixture, el, results } = await setup();
    pick(el, 0, 0);
    pick(el, 1, 1);
    pick(el, 2, 0);
    await fixture.whenStable();

    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();

    expect(results).toEqual([{ score: 67, correct: 2, total: 3, passed: false }]);
    expect(el.querySelector('[role="status"]')?.textContent).toContain('You scored 67%');
  });
});
