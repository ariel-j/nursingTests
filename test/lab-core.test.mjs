import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  award, clampIndex, nextTab, normalizeXp, parseSorterLabels, pickQuestions, sorterIsRight,
  STREAK_BONUS, XP_PER_CORRECT,
} from '../js/lab-core.js';

// Deterministic rng for the shuffle.
const seeded = (seed) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

test('normalizeXp keeps only non-negative safe integers', () => {
  assert.equal(normalizeXp(40), 40);
  for (const bad of [-5, 1.5, NaN, '12', null, undefined, Infinity]) assert.equal(normalizeXp(bad), 0);
});

test('award: correct answers add XP, a bonus starts at the third in a row', () => {
  let s = { xp: 0, streak: 0 };
  s = award(s, true);
  assert.deepEqual(s, { xp: XP_PER_CORRECT, streak: 1 });
  s = award(s, true);
  assert.deepEqual(s, { xp: 2 * XP_PER_CORRECT, streak: 2 });
  s = award(s, true);
  assert.deepEqual(s, { xp: 3 * XP_PER_CORRECT + STREAK_BONUS, streak: 3 });
});

test('award: a miss resets the streak, keeps the XP and does not mutate its input', () => {
  const before = { xp: 35, streak: 4 };
  const after = award(before, false);
  assert.deepEqual(after, { xp: 35, streak: 0 });
  assert.deepEqual(before, { xp: 35, streak: 4 });
});

test('award tolerates missing or corrupt state', () => {
  assert.deepEqual(award(null, true), { xp: XP_PER_CORRECT, streak: 1 });
  assert.deepEqual(award({ xp: 'x', streak: -3 }, true), { xp: XP_PER_CORRECT, streak: 1 });
});

test('pickQuestions returns distinct questions, at most the requested count', () => {
  const quiz = { questions: Array.from({ length: 25 }, (_, i) => ({ id: `q${i}` })) };
  const picked = pickQuestions(quiz, 10, seeded(7));
  assert.equal(picked.length, 10);
  assert.equal(new Set(picked.map((q) => q.id)).size, 10);
  assert.equal(quiz.questions.length, 25);
  assert.equal(pickQuestions({ questions: [{ id: 'a' }, { id: 'b' }] }, 10, seeded(3)).length, 2);
  assert.deepEqual(pickQuestions({}, 10), []);
  assert.deepEqual(pickQuestions(quiz, -1), []);
});

test('pickQuestions varies with the rng', () => {
  const quiz = { questions: Array.from({ length: 30 }, (_, i) => ({ id: `q${i}` })) };
  const a = pickQuestions(quiz, 10, seeded(1)).map((q) => q.id).join();
  const b = pickQuestions(quiz, 10, seeded(2)).map((q) => q.id).join();
  assert.notEqual(a, b);
});

test('parseSorterLabels accepts two to four non-empty texts', () => {
  assert.deepEqual(parseSorterLabels('["א","ב"]'), ['א', 'ב']);
  assert.deepEqual(parseSorterLabels('["א","ב","ג"]'), ['א', 'ב', 'ג']);
  for (const bad of ['["א"]', '["א","ב","ג","ד","ה"]', '["א",""]', '[1,2]', '{}', 'not json', '', undefined]) {
    assert.equal(parseSorterLabels(bad), null, String(bad));
  }
});

test('sorterIsRight compares the pick with the answer', () => {
  assert.equal(sorterIsRight(0, 0), true);
  assert.equal(sorterIsRight(1, 0), false);
  assert.equal(sorterIsRight(undefined, 0), false);
});

test('clampIndex stays inside the list', () => {
  assert.equal(clampIndex(-3, 4), 0);
  assert.equal(clampIndex(9, 4), 3);
  assert.equal(clampIndex(2.7, 4), 2);
  assert.equal(clampIndex(NaN, 4), 0);
  assert.equal(clampIndex(1, 0), 0);
});

test('nextTab follows the reading direction and wraps', () => {
  // RTL: the left arrow moves to the next tab (the one visually further left).
  assert.equal(nextTab('ArrowLeft', 0, 3, true), 1);
  assert.equal(nextTab('ArrowRight', 0, 3, true), 2);
  assert.equal(nextTab('ArrowLeft', 2, 3, true), 0);
  assert.equal(nextTab('ArrowRight', 0, 3, false), 1);
  assert.equal(nextTab('Home', 2, 3), 0);
  assert.equal(nextTab('End', 0, 3), 2);
  assert.equal(nextTab('Enter', 0, 3), null);
  assert.equal(nextTab('ArrowLeft', 0, 0), null);
});
