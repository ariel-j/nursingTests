import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTime,
  newRoundState,
  pointsFor,
  recordBest,
  recordBestTime,
  scoreAnswer,
  secondsLeft,
  splitBySuffix,
  starsFor,
} from '../js/drug-games-core.js';

test('pointsFor grows with the streak and caps the bonus', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map((s) => pointsFor(true, s)), [10, 15, 20, 25, 30, 30, 30]);
  assert.equal(pointsFor(false, 0), 0);
});

test('scoreAnswer keeps score, streak and best streak', () => {
  let s = newRoundState();
  for (const ok of [true, true, false, true]) s = scoreAnswer(s, ok);
  assert.deepEqual(s, { answered: 4, right: 3, score: 35, streak: 1, bestStreak: 2, points: 10 });
});

test('starsFor by share of right answers', () => {
  assert.deepEqual([[10, 10], [9, 10], [8, 10], [7, 10], [4, 10], [3, 10], [0, 0]].map(([r, t]) => starsFor(r, t)), [3, 3, 2, 2, 1, 0, 0]);
});

test('recordBest keeps the highest score and stars, counts plays, flags a new best', () => {
  let r = recordBest(null, { score: 0, stars: 0 });
  assert.deepEqual(r, { best: { score: 0, stars: 0, plays: 1 }, isNew: false });
  r = recordBest(r.best, { score: 120, stars: 2 });
  assert.deepEqual(r, { best: { score: 120, stars: 2, plays: 2 }, isNew: true });
  r = recordBest(r.best, { score: 90, stars: 3 });
  assert.deepEqual(r, { best: { score: 120, stars: 3, plays: 3 }, isNew: false });
  assert.deepEqual(recordBest({ score: 'x' }, { score: 5, stars: 1 }).best, { score: 5, stars: 1, plays: 1 });
});

test('recordBestTime keeps the lowest time per key', () => {
  let r = recordBestTime(null, 'a|m', 30000);
  assert.deepEqual(r, { times: { 'a|m': 30000 }, isNew: true });
  r = recordBestTime(r.times, 'a|m', 40000);
  assert.equal(r.isNew, false);
  assert.equal(r.times['a|m'], 30000);
  r = recordBestTime(r.times, 'a|m', 20000);
  assert.deepEqual(r.times, { 'a|m': 20000 });
});

test('formatTime and secondsLeft', () => {
  assert.equal(formatTime(65400), '1:05');
  assert.equal(formatTime(-5), '0:00');
  assert.equal(secondsLeft(0, 0), 60);
  assert.equal(secondsLeft(0, 59500), 1);
  assert.equal(secondsLeft(0, 61000), 0);
  assert.equal(secondsLeft(1000, 6000, 10), 5);
});

test('splitBySuffix highlights the suffix, or the prefix for cef-', () => {
  assert.deepEqual(splitBySuffix('Metoprolol', 'olol$'), { lead: '', head: 'Metopr', tail: 'olol' });
  assert.deepEqual(splitBySuffix('Labetalol', '(alol|ilol)$'), { lead: '', head: 'Labet', tail: 'alol' });
  assert.deepEqual(splitBySuffix('Ceftriaxone', '^cef'), { lead: 'Cef', head: 'triaxone', tail: '' });
  assert.deepEqual(splitBySuffix('Aspirin', 'olol$'), { lead: '', head: 'Aspirin', tail: '' });
  assert.deepEqual(splitBySuffix('Aspirin', '('), { lead: '', head: 'Aspirin', tail: '' });
});
