import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';

import { QuizLesson, QuizResult, gradeQuiz } from '@core/models';

@Component({
  selector: 'app-quiz',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatRadioModule],
  template: `
    <form (submit)="$event.preventDefault(); submit()">
      @for (q of quiz().questions; track q.id; let i = $index) {
        <fieldset
          class="question"
          [class.correct]="result() && answers()[q.id] === q.answer"
          [class.wrong]="result() && answers()[q.id] !== q.answer"
        >
          <legend>{{ i + 1 }}. {{ q.prompt }}</legend>
          <mat-radio-group
            [value]="answers()[q.id]"
            (change)="choose(q.id, $event.value)"
            [disabled]="!!result()"
            [attr.aria-label]="q.prompt"
          >
            @for (option of q.options; track $index; let o = $index) {
              <mat-radio-button [value]="o">{{ option }}</mat-radio-button>
            }
          </mat-radio-group>
          @if (result() && q.explanation) {
            <p class="explanation">{{ q.explanation }}</p>
          }
        </fieldset>
      }

      @if (result(); as r) {
        <div class="result" role="status" [class.passed]="r.passed">
          <mat-icon>{{ r.passed ? 'emoji_events' : 'replay' }}</mat-icon>
          <span>
            You scored {{ r.score }}% ({{ r.correct }}/{{ r.total }}).
            {{ r.passed ? 'Lesson complete.' : 'You need ' + quiz().passingScore + '% to pass.' }}
          </span>
          <button mat-button type="button" (click)="retry()">Try again</button>
        </div>
      } @else {
        <button mat-flat-button type="submit" [disabled]="!complete()">Submit answers</button>
      }
    </form>
  `,
  styles: `
    .question {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      padding: 12px 16px;
      margin: 0 0 16px;
    }
    .question.correct {
      border-color: #2e7d32;
    }
    .question.wrong {
      border-color: var(--mat-sys-error);
    }
    legend {
      font-weight: 500;
      padding: 0 4px;
    }
    mat-radio-group {
      display: flex;
      flex-direction: column;
    }
    .explanation {
      font-size: 0.85rem;
      opacity: 0.8;
    }
    .result {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .result.passed {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
  `,
})
export class QuizComponent {
  readonly quiz = input.required<QuizLesson>();
  readonly graded = output<QuizResult>();

  /** Answers reset automatically whenever a different quiz is bound. */
  protected readonly answers = linkedSignal<QuizLesson, Record<string, number>>({
    source: this.quiz,
    computation: () => ({}),
  });
  protected readonly result = signal<QuizResult | null>(null);
  protected readonly complete = computed(() =>
    this.quiz().questions.every((q) => this.answers()[q.id] !== undefined),
  );

  protected choose(questionId: string, option: number): void {
    this.answers.update((a) => ({ ...a, [questionId]: option }));
  }

  protected submit(): void {
    const result = gradeQuiz(this.quiz(), this.answers());
    this.result.set(result);
    this.graded.emit(result);
  }

  protected retry(): void {
    this.answers.set({});
    this.result.set(null);
  }
}
