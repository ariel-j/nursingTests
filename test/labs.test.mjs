import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLabs, labPageErrors } from '../scripts/labs.mjs';
import { ROUND_SIZE, award, parseSorter, pickRound } from '../js/lab-logic.js';

const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('pickRound returns distinct questions, capped at the round size', () => {
  const questions = Array.from({ length: 25 }, (_, i) => ({ id: `q${i}` }));
  const round = pickRound(questions, ROUND_SIZE, seq(0.1, 0.9, 0.4));
  assert.equal(round.length, ROUND_SIZE);
  assert.equal(new Set(round.map((q) => q.id)).size, ROUND_SIZE);
  assert.equal(pickRound(questions.slice(0, 3), ROUND_SIZE).length, 3);
  assert.equal(questions.length, 25, 'input is not mutated');
});

test('award gives 10 XP, a bonus from the third correct in a row, and resets on a miss', () => {
  let s = { xp: 0, streak: 0 };
  s = award(s, true);
  s = award(s, true);
  assert.deepEqual(s, { xp: 20, streak: 2 });
  s = award(s, true);
  assert.deepEqual(s, { xp: 35, streak: 3 });
  assert.deepEqual(award(s, false), { xp: 35, streak: 0 });
});

test('parseSorter accepts valid data and rejects bad label indexes', () => {
  const ok = parseSorter({ labels: ['א', 'ב'], items: [['x', 0, 'note'], ['y', 1]] });
  assert.deepEqual(ok.items[1], { text: 'y', label: 1, note: '' });
  assert.throws(() => parseSorter({ labels: ['א', 'ב'], items: [['x', 2]] }), /out of range/);
  assert.throws(() => parseSorter({ labels: ['א'], items: [['x', 0]] }), /two labels/);
  assert.throws(() => parseSorter('{'));
});

test('labPageErrors requires the lab hooks', () => {
  const errors = labPageErrors('<html><body></body></html>', { id: 'fungi', quiz: 'fungi-1' });
  for (const re of [/data-lab="fungi"/, /lab\.js/, /id="xp"/, /id="quizbox"/]) {
    assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}`);
  }
});

test('the committed labs pass every check', async () => {
  assert.deepEqual(await checkLabs(), []);
});
