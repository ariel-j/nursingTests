import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSummaries, pageErrors } from '../scripts/summaries.mjs';

const page = (body) => `<!doctype html><html><head>
<script type="module" src="../js/a11y.js"></script></head><body>${body}
<footer><a href="../accessibility.html">א</a><a href="../privacy.html">פ</a></footer></body></html>`;
const summary = (id) => page(`<button data-print>הדפסה</button><article class="summary" data-system="${id}">תוכן</article>`);

test('pageErrors accepts a well-formed summary page', () => {
  assert.deepEqual(pageErrors(summary('heart'), { id: 'heart', isSummary: true }), []);
});

test('pageErrors rejects external resources, inline styles and handlers', () => {
  const external = page('<link href="https://fonts.googleapis.com/css2">');
  assert.ok(pageErrors(external, { id: 'x' }).some((e) => /external/.test(e)));
  assert.ok(pageErrors(page('<img src="//cdn.example/x.png">'), { id: 'x' }).some((e) => /external/.test(e)));
  assert.ok(pageErrors(page('<p style="margin:0">'), { id: 'x' }).some((e) => /inline/.test(e)));
  assert.ok(pageErrors(page('<button onclick="print()">'), { id: 'x' }).some((e) => /inline/.test(e)));
  // Plain text that mentions a site is fine.
  assert.deepEqual(pageErrors(page('<p>see example.com</p>'), { id: 'x' }), []);
});

test('pageErrors requires the toolbar, footer links, article and print button', () => {
  const bare = '<html><body><article class="summary" data-system="other"></article></body></html>';
  const errors = pageErrors(bare, { id: 'heart', isSummary: true });
  for (const re of [/a11y/, /accessibility/, /privacy/, /data-system="heart"/, /print/]) {
    assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}`);
  }
});

test('the committed summaries pass every check', async () => {
  assert.deepEqual(await checkSummaries(), []);
});
