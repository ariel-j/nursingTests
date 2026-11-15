import test from 'node:test';
import assert from 'node:assert/strict';
import { lintQuiz, questionTells } from '../scripts/quiz-lint.mjs';

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

test('small quizzes skip the quiz-wide checks', () => {
  const build = () => ({ options: ['אבגדהו', 'אבג', 'דהו', 'זחט'], correct: 0 });
  assert.match(lintQuiz(make(30, build)).join('\n'), /longest in 100%/);
  assert.deepEqual(lintQuiz(make(5, build)), []);
});

const q = (options, correct = 0) => ({ id: 'q', options: options.map((text) => ({ text })), correct });

test('a question with alike options has no tells', () => {
  assert.deepEqual(questionTells(q(['מעכב אנזים בכליה', 'חוסם בטא בלב', 'משתן לולאה', 'חוסם סידן בעורקים'])), []);
});

test('a much longer correct option is a tell, a few letters longer is not', () => {
  assert.match(questionTells(q(['ניטור רמות התרופה ובדיקת שמיעה', 'ניטור INR', 'בדיקת עיניים', 'בדיקת שומנים'])).join(), /longest/);
  assert.deepEqual(questionTells(q(['Chloramphenicol', 'Ertapenem', 'Cefuroxime', 'Minocycline'])), []);
});

test('a feature only the correct option has is a tell', () => {
  assert.match(questionTells(q(['ויטמין B6', 'ויטמין ג', 'ויטמין ק', 'ויטמין א'])).join(), /Latin.*digits|digits/);
  assert.match(questionTells(q(['אלפא (Alpha)', 'בטא', 'גמא', 'דלתא'])).join(), /parentheses/);
  assert.match(questionTells(q(['כאב, לחץ וכובד', 'כאב ראש', 'כאב בטן', 'כאב גב'])).join(), /list or clause/);
  assert.deepEqual(questionTells(q(['אלפא (A)', 'בטא (B)', 'גמא', 'דלתא'])), []);
});

test('an absolute word on a wrong option is a tell unless the correct one has one too', () => {
  assert.match(questionTells(q(['גמא דלתא', 'אלפא בלבד', 'בטא אחת', 'זטא אתא'])).join(), /absolute/);
  assert.deepEqual(questionTells(q(['גמא בלבד', 'אלפא בלבד', 'בטא אחת', 'זטא אתא'])), []);
});

test('a small quiz still reports the questions with tells', () => {
  const quiz = { id: 'tiny', questions: [q(['אלפא (Alpha)', 'בטא', 'גמא', 'דלתא'])] };
  assert.match(lintQuiz(quiz).join(), /1 questions give the answer away \(q\)/);
});
