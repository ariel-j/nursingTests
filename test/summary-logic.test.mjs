import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesQuery, percent, textKey, validChecks } from '../js/summary-logic.js';

test('textKey is stable across whitespace and differs between texts', () => {
  assert.equal(textKey('a  b\n c'), textKey(' a b c '));
  assert.notEqual(textKey('alpha'), textKey('beta'));
});

test('matchesQuery is case-insensitive and an empty query matches everything', () => {
  assert.ok(matchesQuery('Propofol induction', 'PROPO'));
  assert.ok(matchesQuery('anything', '   '));
  assert.ok(!matchesQuery('Propofol', 'ketamine'));
  assert.ok(matchesQuery('הרדמה  כללית', 'הרדמה כללית'));
});

test('percent rounds and handles an empty list', () => {
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(0, 0), 0);
  assert.equal(percent(4, 4), 100);
});

test('validChecks keeps only keys that still exist and tolerates bad data', () => {
  assert.deepEqual([...validChecks(['a', 'gone', 'b'], ['a', 'b', 'c'])].sort(), ['a', 'b']);
  assert.equal(validChecks(null, ['a']).size, 0);
  assert.equal(validChecks({ a: true }, ['a']).size, 0);
});
