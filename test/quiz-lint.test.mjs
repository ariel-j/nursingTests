import test from 'node:test';
import assert from 'node:assert/strict';
import { lintQuiz } from '../scripts/quiz-lint.mjs';

const make = (n, build) => ({
  questions: Array.from({ length: n }, (_, i) => {
    const { options, correct } = build(i);
    return { id: `q${i}`, options: options.map((text) => ({ text })), correct };
  }),
});

test('a balanced quiz gives no warnings', () => {
  const quiz = make(30, (i) => ({
    options: ['אלפא בטא', 'גמא דלתא', 'אפסילון זטא', 'אתא תטא'],
    correct: i % 4,
  }));
  assert.deepEqual(lintQuiz(quiz), []);
});

test('a long correct option is reported', () => {
  const quiz = make(30, () => ({
    options: ['תשובה נכונה וארוכה מאוד עם הרבה פרטים נוספים', 'קצר', 'קצר שני', 'קצר שלישי'],
    correct: 0,
  }));
  const w = lintQuiz(quiz).join('\n');
  assert.match(w, /longest in 100%/);
  assert.match(w, /median/);
});

test('a feature only the correct option has is reported', () => {
  const quiz = make(30, () => ({
    options: ['אלפא (Alpha)', 'בטא', 'גמא', 'דלתא'],
    correct: 0,
  }));
  assert.match(lintQuiz(quiz).join('\n'), /parentheses/);
});

test('absolute words only in wrong options are reported', () => {
  const quiz = make(30, () => ({
    options: ['אלפא', 'בטא תמיד', 'גמא לעולם', 'דלתא בלבד'],
    correct: 0,
  }));
  assert.match(lintQuiz(quiz).join('\n'), /absolute words/);
});

test('small quizzes are not judged', () => {
  assert.deepEqual(lintQuiz(make(5, () => ({ options: ['ארוך מאוד מאוד מאוד', 'א', 'ב', 'ג'], correct: 0 }))), []);
});
