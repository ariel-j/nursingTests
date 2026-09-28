import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECG_BASELINE, ECG_WIDTH, ecgPath } from '../js/ecg.js';

const points = (d) => d.trim().split(/\s*[ML]/).filter(Boolean).map((p) => p.trim().split(/\s+/).map(Number));

test('empty progress is a flat start point', () => {
  assert.equal(ecgPath(0), `M0 ${ECG_BASELINE}`);
  assert.equal(ecgPath(NaN), `M0 ${ECG_BASELINE}`);
  assert.equal(ecgPath(-1), `M0 ${ECG_BASELINE}`);
});

test('full progress draws every beat and ends at the right edge', () => {
  const pts = points(ecgPath(1, 10));
  assert.deepEqual(pts.at(-1), [ECG_WIDTH, ECG_BASELINE]);
  const peaks = pts.filter(([, y]) => y < ECG_BASELINE - 20);
  assert.equal(peaks.length, 10);
});

test('partial progress ends on the baseline at the matching x', () => {
  const pts = points(ecgPath(0.55, 10));
  assert.deepEqual(pts.at(-1), [550, ECG_BASELINE]);
  assert.equal(pts.filter(([, y]) => y < ECG_BASELINE - 20).length, 5);
});

test('x never goes backwards and stays within the strip', () => {
  const xs = points(ecgPath(0.73)).map(([x]) => x);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] >= xs[i - 1]);
  assert.ok(Math.max(...xs) <= ECG_WIDTH);
});
