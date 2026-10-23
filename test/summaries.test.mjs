import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRootPages, checkSummaries, pageErrors, recollectionMentions } from '../scripts/summaries.mjs';
import { loadCatalog } from '../scripts/quizzes.mjs';

const page = (body) => `<!doctype html><html><head>
<script type="module" src="../js/nav.js"></script>
<script type="module" src="../js/a11y.js"></script>
<script type="module" src="../js/analytics.js"></script></head><body>${body}
<footer><a href="../accessibility.html">א</a><a href="../privacy.html">פ</a><p>תוכן לימודי, אינו מהווה ייעוץ רפואי.</p></footer></body></html>`;
const summary = (id) => page(`<button data-print>הדפסה</button><article class="summary" data-system="${id}"><section class="intro">מבוא</section><section class="glossary" id="g">מילון</section><section><h2>1 · יסודות</h2></section></article>`);

test('pageErrors accepts a well-formed summary page', () => {
  assert.deepEqual(pageErrors(summary('heart'), { id: 'heart', isSummary: true }), []);
});

test('pageErrors requires the intro and glossary before chapter 1', () => {
  const body = (inner) => page(`<button data-print>הדפסה</button><article class="summary" data-system="x">${inner}</article>`);
  const chapter = '<section><h2>1 · יסודות</h2></section>';
  const missing = pageErrors(body(chapter), { id: 'x', isSummary: true });
  assert.ok(missing.some((e) => /intro/.test(e)) && missing.some((e) => /glossary/.test(e)));
  const late = body(`${chapter}<section class="intro">א</section><section class="glossary">ב</section>`);
  assert.ok(pageErrors(late, { id: 'x', isSummary: true }).some((e) => /before chapter 1/.test(e)));
});

test('pageErrors rejects external resources, inline styles and handlers', () => {
  const external = page('<link href="https://fonts.googleapis.com/css2">');
  assert.ok(pageErrors(external, { id: 'x' }).some((e) => /external/.test(e)));
  assert.ok(pageErrors(page('<img src="//cdn.example/x.png">'), { id: 'x' }).some((e) => /external/.test(e)));
  assert.ok(pageErrors(page('<p style="margin:0">'), { id: 'x' }).some((e) => /inline/.test(e)));
  assert.ok(pageErrors(page('<button onclick="print()">'), { id: 'x' }).some((e) => /inline/.test(e)));
  // Plain text that mentions a site, or a plain link to one, is fine.
  assert.deepEqual(pageErrors(page('<a href="https://docs.github.com/">GitHub</a>'), { id: 'x' }), []);
  assert.deepEqual(pageErrors(page('<p>see example.com</p>'), { id: 'x' }), []);
});

test('pageErrors requires the toolbar, counter, footer links and disclaimer, article and print button', () => {
  const bare = '<html><body><article class="summary" data-system="other"></article></body></html>';
  const errors = pageErrors(bare, { id: 'heart', isSummary: true });
  for (const re of [/a11y/, /analytics/, /nav\.js/, /accessibility/, /privacy/, /medical/, /data-system="heart"/, /print/]) {
    assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}`);
  }
});

test('recollectionMentions counts every form of שחזור', () => {
  assert.equal(recollectionMentions('נשאל בשחזורים, ושחזור אחד'), 2);
  assert.equal(recollectionMentions('הופיע בעבר'), 0);
});

test('pageErrors checks root pages against root-relative paths', () => {
  const root = '<script type="module" src="js/nav.js"></script><script type="module" src="js/a11y.js"></script><script type="module" src="js/analytics.js"></script>'
    + '<a href="accessibility.html">א</a><a href="privacy.html">פ</a><p>אינו מהווה ייעוץ רפואי</p>';
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

test('pageErrors needs exactly one correct option per mini-quiz question', () => {
  const quiz = (items) => summary('heart').replace('</article>',
    `<div class="mq-set"><div class="mq"><p class="mq-q">ש</p><ul class="mq-opts">${items}</ul><p class="mq-exp">ה</p></div></div></article>`);
  const opts = (n) => '<li class="ok">א</li>'.repeat(n) + '<li>ב</li>';
  assert.deepEqual(pageErrors(quiz(opts(1)), { id: 'heart', isSummary: true }), []);
  assert.equal(pageErrors(quiz(opts(0)), { id: 'heart', isSummary: true }).length, 1);
  assert.equal(pageErrors(quiz(opts(2)), { id: 'heart', isSummary: true }).length, 1);
});
