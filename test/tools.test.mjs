import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_TOPICS, CIRCULARS_MAP, FALL_GROUPS, atRiskByChecklist, drillItemErrors, fallBand, fallBarWidths,
  filterMap, mapTopics, optionOrder, restraintClock, topicOf,
} from '../js/tool-core.js';
import { checkTools, drillDataErrors } from '../scripts/tools.mjs';

const scoreOf = (picks) => FALL_GROUPS.reduce((sum, [key, , options, preset]) => sum + options[picks[key] ?? preset][1], 0);

test('fallBand follows the printed cut-offs: up to 5, 6-11, 12 and over', () => {
  assert.equal(fallBand(0).id, 'low');
  assert.equal(fallBand(5).id, 'low');
  assert.equal(fallBand(6).id, 'high');
  assert.equal(fallBand(11).id, 'high');
  assert.equal(fallBand(12).id, 'vhigh');
  assert.equal(fallBand(18).id, 'vhigh');
});

test('the preset calculator values are the 80-year-old worked example: 5, low', () => {
  assert.equal(scoreOf({}), 5);
  assert.equal(fallBand(scoreOf({})).id, 'low');
  // 70 years old, dizzy, sedating medication, nothing else: 1 + 2 + 5 = 8, high.
  const second = scoreOf({ fall: 0, mob: 0, age: 1, phys: 2, med: 1 });
  assert.equal(second, 8);
  assert.equal(fallBand(second).id, 'high');
});

test('every calculator group starts at 0 points, so "reset" can pick the first option', () => {
  for (const [key, , options] of FALL_GROUPS) assert.equal(options[0][1], 0, key);
});

test('fallBarWidths splits the score across the three segments and clamps at the scale', () => {
  assert.deepEqual(fallBarWidths(0), [0, 0, 0]);
  assert.deepEqual(fallBarWidths(8), [(5 / 16) * 100, (3 / 16) * 100, 0]);
  const full = fallBarWidths(40);
  assert.equal(full.reduce((a, b) => a + b, 0), 100);
});

test('checklist: 3 or more factors is at risk', () => {
  assert.equal(atRiskByChecklist(2), false);
  assert.equal(atRiskByChecklist(3), true);
});

test('restraintClock: orders last 8 hours, assess every 2, visit every half hour, approval over 24', () => {
  assert.deepEqual(restraintClock(0), { hours: 0, orders: 1, assessments: 0, visits: 0, status: 'valid' });
  assert.deepEqual(restraintClock(9), { hours: 9, orders: 2, assessments: 4, visits: 18, status: 'valid' });
  assert.equal(restraintClock(8).status, 'renew');
  assert.equal(restraintClock(8).orders, 1);
  assert.equal(restraintClock(24).status, 'renew');
  assert.equal(restraintClock(25).status, 'approval');
  assert.equal(restraintClock(-3).hours, 0);
});

test('the circulars filter keeps the table order and "הכול" shows every row', () => {
  const topics = mapTopics(CIRCULARS_MAP);
  assert.equal(topics[0], ALL_TOPICS);
  assert.equal(new Set(topics).size, topics.length);
  assert.equal(filterMap(CIRCULARS_MAP, ALL_TOPICS).length, CIRCULARS_MAP.length);
  const filtered = filterMap(CIRCULARS_MAP, 'שלמות הרקמה');
  assert.deepEqual(filtered.map((r) => r[0]), ['153/2019', '126/2017', '166/2020']);
  assert.ok(filtered.every((r) => topicOf(r) === 'שלמות הרקמה'));
});

test('optionOrder keeps the written order unless asked to shuffle, and always a permutation', () => {
  const item = { prompt: 'p', options: ['a', 'b', 'c', 'd'], correct: 0 };
  assert.deepEqual(optionOrder(item), [0, 1, 2, 3]);
  const shuffled = optionOrder(item, () => 0.1, true);
  assert.deepEqual([...shuffled].sort(), [0, 1, 2, 3]);
});

test('drillItemErrors rejects malformed items', () => {
  assert.deepEqual(drillItemErrors({ prompt: 'p', options: ['a', 'b'], correct: 1 }, 'x'), []);
  assert.ok(drillItemErrors({ prompt: '', options: ['a', 'b'], correct: 0 }, 'x').length > 0);
  assert.ok(drillItemErrors({ prompt: 'p', options: ['a'], correct: 0 }, 'x').length > 0);
  assert.ok(drillItemErrors({ prompt: 'p', options: ['a', 'a'], correct: 0 }, 'x').length > 0);
  assert.ok(drillItemErrors({ prompt: 'p', options: ['a', 'b'], correct: 2 }, 'x').length > 0);
});

test('the committed drills and tool pages pass every check', async () => {
  assert.deepEqual(drillDataErrors(), []);
  assert.deepEqual(await checkTools(), []);
});
