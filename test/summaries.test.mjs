import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSummaries, entryErrors, pageErrors } from '../scripts/summaries.mjs';

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

const lab = (id, quiz) => page(`<button data-print>הדפסה</button><script type="module" src="../js/lab.js"></script>
<article class="summary" data-system="${id}" data-quiz="${quiz}"><section class="lab-quiz no-print" data-quiz="${quiz}" hidden></section>
<a href="../quiz.html?id=${quiz}">לבוחן</a></article>`);

test('pageErrors accepts a lab page and checks its hooks', () => {
  assert.deepEqual(pageErrors(lab('pharm-x', 'q-1'), { id: 'pharm-x', isSummary: true, quiz: 'q-1' }), []);
  // The article must carry the quiz named by the list entry, and the list entry must exist for lab.js.
  const wrongQuiz = pageErrors(lab('pharm-x', 'q-2'), { id: 'pharm-x', isSummary: true, quiz: 'q-1' });
  assert.ok(wrongQuiz.some((e) => /data-quiz="q-1"/.test(e)));
  const noEntryQuiz = pageErrors(lab('pharm-x', 'q-1'), { id: 'pharm-x', isSummary: true });
  assert.ok(noEntryQuiz.some((e) => /needs exactly one/.test(e)));
  const noLabJs = lab('pharm-x', 'q-1').replace('<script type="module" src="../js/lab.js"></script>', '');
  assert.ok(pageErrors(noLabJs, { id: 'pharm-x', isSummary: true, quiz: 'q-1' }).some((e) => /lab\.js/.test(e)));
});

const catalog = { subjects: [{ name: 'S', units: ['U1', 'U2'] }] };
const quizzes = [{ id: 'q-1', subject: 'S', unit: 'U1' }];

test('entryErrors checks subject, unit and warm-up quiz against the catalog and quizzes', () => {
  assert.deepEqual(entryErrors({ subject: 'S' }, catalog, quizzes), []);
  assert.deepEqual(entryErrors({ subject: 'S', unit: 'U1', quiz: 'q-1' }, catalog, quizzes), []);
  assert.ok(entryErrors({ subject: 'X' }, catalog, quizzes).some((e) => /subject/.test(e)));
  assert.ok(entryErrors({ subject: 'S', unit: 'nope' }, catalog, quizzes).some((e) => /unit/.test(e)));
  assert.ok(entryErrors({ subject: 'S', unit: 'U1', quiz: 'missing' }, catalog, quizzes).some((e) => /does not exist/.test(e)));
  assert.ok(entryErrors({ subject: 'S', unit: 'U2', quiz: 'q-1' }, catalog, quizzes).some((e) => /belongs to/.test(e)));
});
