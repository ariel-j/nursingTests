import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FALL_GROUPS,
  FALL_MAX,
  atRisk,
  fallBand,
  fallScore,
  restraintAt,
} from '../js/tools-logic.js';

test('fallBand: up to 5 low, 6-11 high, 12 and above very high', () => {
  const ids = [0, 5, 6, 11, 12, FALL_MAX].map((s) => fallBand(s).id);
  assert.deepEqual(ids, ['low', 'low', 'high', 'high', 'vhigh', 'vhigh']);
});

test('fallScore sums points and FALL_MAX is the best option of every group', () => {
  assert.equal(fallScore([]), 0);
  assert.equal(fallScore([1, 2, 3]), 6);
  assert.equal(FALL_MAX, 1 + 2 + 3 + 3 + 2 + 2 + 5);
  for (const [, , options, start] of FALL_GROUPS) assert.ok(options[start], 'default option exists');
});

test('atRisk needs 3 or more factors', () => {
  assert.deepEqual([0, 2, 3, 10].map(atRisk), [false, false, true, true]);
});

test('restraintAt counts orders, assessments and visits', () => {
  assert.deepEqual(restraintAt(9), { hours: 9, orders: 2, assessments: 4, visits: 18, status: 'valid' });
  assert.deepEqual(restraintAt(0), { hours: 0, orders: 1, assessments: 0, visits: 0, status: 'valid' });
});

test('restraintAt flags renewal at every 8th hour and manager approval after 24', () => {
  assert.equal(restraintAt(8).status, 'renew');
  assert.equal(restraintAt(16).status, 'renew');
  assert.equal(restraintAt(24).status, 'renew');
  assert.equal(restraintAt(25).status, 'over24');
  assert.equal(restraintAt(30).status, 'over24');
  assert.equal(restraintAt(-3).hours, 0);
});

test('the printed scoring table in safety.html lists every group and option', async () => {
  const html = await readFile(new URL('../summaries/safety.html', import.meta.url), 'utf8');
  for (const [, label, options] of FALL_GROUPS) {
    assert.ok(html.includes(label), `missing group "${label}"`);
    for (const [text] of options) assert.ok(html.includes(text), `missing option "${text}"`);
  }
});
