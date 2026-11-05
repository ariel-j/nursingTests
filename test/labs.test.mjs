import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLabs, labPageErrors } from '../scripts/labs.mjs';

const page = (body) => `<!doctype html><html><head>
<script type="module" src="../js/a11y.js"></script><script type="module" src="../js/lab.js"></script></head><body>${body}
<footer><a href="../accessibility.html">א</a><a href="../privacy.html">פ</a></footer></body></html>`;

test('labPageErrors accepts a well-formed lab page', () => {
  assert.deepEqual(labPageErrors(page('<main data-lab="x"></main>'), { id: 'x', isLab: true }), []);
});

test('labPageErrors rejects external resources and inline handlers', () => {
  assert.ok(labPageErrors(page('<link href="https://fonts.googleapis.com/css2">'), { id: 'x' }).some((e) => /external/.test(e)));
  assert.ok(labPageErrors(page('<button onclick="go()">'), { id: 'x' }).some((e) => /inline/.test(e)));
});

test('labPageErrors requires the lab script and data-lab', () => {
  const bare = '<html><body><main></main></body></html>';
  const errors = labPageErrors(bare, { id: 'x', isLab: true });
  for (const re of [/lab\.js/, /data-lab="x"/]) assert.ok(errors.some((e) => re.test(e)), `expected ${re}`);
});

test('the real labs pass every check', async () => {
  assert.deepEqual(await checkLabs(), []);
});
