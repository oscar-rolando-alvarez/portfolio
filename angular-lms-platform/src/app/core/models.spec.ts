import { COURSE, QUIZ } from '../testing/fixtures';
import { courseDuration, formatDuration, gradeQuiz } from './models';

describe('gradeQuiz', () => {
  it('scores correct answers and applies the passing threshold', () => {
    expect(gradeQuiz(QUIZ, { a: 0, b: 1, c: 1 })).toEqual({
      score: 100,
      correct: 3,
      total: 3,
      passed: true,
    });
    expect(gradeQuiz(QUIZ, { a: 0, b: 1, c: 0 })).toEqual({
      score: 67,
      correct: 2,
      total: 3,
      passed: false,
    });
  });

  it('treats unanswered questions as incorrect', () => {
    expect(gradeQuiz(QUIZ, {}).score).toBe(0);
  });
});

describe('duration helpers', () => {
  it('sums lesson durations', () => {
    expect(courseDuration(COURSE)).toBe(75);
  });

  it('formats minutes as hours and minutes', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(75)).toBe('1h 15m');
    expect(formatDuration(120)).toBe('2h 00m');
  });
});
