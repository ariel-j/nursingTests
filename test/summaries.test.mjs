import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRootPages, checkSummaries, pageErrors } from '../scripts/summaries.mjs';
import { loadCatalog } from '../scripts/quizzes.mjs';

const page = (body) => `<!doctype html><html><head>
<script type="module" src="../js/nav.js"></script>
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
  for (const re of [/a11y/, /nav\.js/, /accessibility/, /privacy/, /data-system="heart"/, /print/]) {
    assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}`);
  }
});

test('pageErrors checks root pages against root-relative paths', () => {
  const root = '<script type="module" src="js/nav.js"></script><script type="module" src="js/a11y.js"></script>'
    + '<a href="accessibility.html">א</a><a href="privacy.html">פ</a>';
  assert.deepEqual(pageErrors(root, { id: 'index.html', root: '' }), []);
  assert.ok(pageErrors(root.replace('js/nav.js', 'js/other.js'), { id: 'index.html', root: '' }).some((e) => /side menu/.test(e)));
});

test('the committed summaries and pages pass every check', async () => {
  const { catalog } = await loadCatalog();
  assert.deepEqual(await checkSummaries(catalog.subjects.map((s) => s.id)), []);
  assert.deepEqual(await checkRootPages(), []);
});

test('checkSummaries rejects a summary whose subject is not in the catalog', async () => {
  const errors = await checkSummaries(['pharmacology']);
  assert.ok(errors.some((e) => /subject "anatomy"/.test(e)));
});
