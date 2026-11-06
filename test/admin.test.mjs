import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { seal, open, passwordProblems, backoffMs, looksLikeToken } from '../js/admin/vault.js';
import { checkUpload, checkVideo, isWritablePath, isValidId, withSummaryAccent, setSummaryAccent, withoutSummaryAccent, readSummaryHue } from '../js/admin/uploads.js';
import { createGithub, ConflictError } from '../js/admin/github.js';
import { planQuiz, planSummary, planStructure, planQuizDelete, detectQuizFormat, planQuizEdit, planSummaryDelete, planSummaryEdit, planSummaryOrder, planDeck, planDeckEdit, planDeckDelete, manifestFile } from '../js/admin/actions.js';
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
  assert.ok(planStructure({ catalog: { subjects: [{ name: 'מקצוע', units: ['אחרת'] }] }, quizzes: [quiz] }).errors.length > 0);
  const ok = planStructure({ catalog: { subjects: [{ name: 'מקצוע', units: ['יחידה', 'חדשה'] }] }, quizzes: [quiz] });
  assert.deepEqual(ok.errors, []);
  assert.ok(planStructure({ catalog: { subjects: [] }, quizzes: [] }).errors.length > 0);
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

// ---------- Phase 1.5: edit / delete / reorder ----------
const readRepo = (f) => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const quizIn = (id, subject, unit, title) => JSON.parse(planQuiz({ source: { ...authoring(id), subject, unit, title }, catalog: { subjects: [{ name: subject, units: [unit] }] }, quizzes: [] }).files[0].text);

test('accent helpers: set replaces only that line, remove deletes it, hue is read back and coerced', async () => {
  const css = await readRepo('css/summary.css');
  const added = withSummaryAccent(css, 'abc', 100);
  assert.equal(readSummaryHue(added, 'abc'), 100);
  const changed = setSummaryAccent(added, 'abc', 250);
  assert.equal(readSummaryHue(changed, 'abc'), 250);
  assert.equal(changed.split('\n').length, added.split('\n').length, 'replaced in place, no extra line');
  assert.equal(withoutSummaryAccent(changed, 'abc'), css, 'removing restores the original file exactly');
  assert.equal(withoutSummaryAccent(css, 'nope'), css);
  assert.equal(readSummaryHue(css, 'cardiovascular'), null, 'hand-written hex accents have no panel hue');
  const injected = setSummaryAccent(css, 'abc', '10; } body { display:none');
  assert.ok(injected.includes('hsl(0 ') && !injected.includes('display:none'), 'non-numeric hue becomes 0, text never reaches the css');
  assert.ok(!setSummaryAccent(css, 'abc', 'x; evil').includes('evil'));
  assert.throws(() => setSummaryAccent(css, '"] x', 1));
  assert.throws(() => withoutSummaryAccent(css, '../x'));
  // other summaries' lines are untouched by a neighbour with a shared prefix
  const two = withSummaryAccent(withSummaryAccent(css, 'abc', 1), 'abc-two', 2);
  assert.ok(withoutSummaryAccent(two, 'abc').includes('[data-system="abc-two"]'));
});

test('plan structure: rename cascades into quizzes and the manifest in one plan', () => {
  const cat = { subjects: [{ name: 'מקצוע', units: ['יחידה', 'אחרת'] }] };
  const q1 = { ...quizIn('q-one', 'מקצוע', 'יחידה', 'א') };
  const after = { subjects: [{ name: 'מקצוע חדש', units: ['יחידה חדשה', 'אחרת'] }] };
  const plan = planStructure({ catalog: after, quizzes: [q1], renames: { subjects: { מקצוע: 'מקצוע חדש' }, units: { מקצוע: { יחידה: 'יחידה חדשה' } } } });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.files.map((f) => f.path), ['quizzes/subjects.json', 'quizzes/q-one.json', 'quizzes/manifest.json']);
  const moved = JSON.parse(plan.files[1].text);
  assert.equal(moved.subject, 'מקצוע חדש'); assert.equal(moved.unit, 'יחידה חדשה');
  assert.equal(JSON.parse(plan.files[2].text).subjects[0].units[0].quizzes[0].id, 'q-one');
  assert.ok(/1 מבחנים/.test(plan.summary));
  // swapping two names at once works (mapping is simultaneous)
  const q2 = { ...quizIn('q-two', 'מקצוע', 'אחרת', 'ב') };
  const swap = planStructure({ catalog: { subjects: [{ name: 'מקצוע', units: ['אחרת', 'יחידה'] }] }, quizzes: [q1, q2], renames: { units: { מקצוע: { יחידה: 'אחרת', אחרת: 'יחידה' } } } });
  assert.deepEqual(swap.errors, []);
  assert.equal(JSON.parse(swap.files.find((f) => f.path === 'quizzes/q-one.json').text).unit, 'אחרת');
  void cat;
});

test('plan structure: rename onto an existing name, or removing a non-empty unit/subject, is refused with the quiz titles', () => {
  const q1 = { ...quizIn('q-one', 'מקצוע', 'יחידה', 'מבחן ראשון') };
  const dupe = planStructure({ catalog: { subjects: [{ name: 'מקצוע', units: ['x', 'x'] }] }, quizzes: [q1], renames: { units: { מקצוע: { יחידה: 'x' } } } });
  assert.ok(dupe.errors.length > 0 && dupe.files.length === 0);
  const rm = planStructure({ catalog: { subjects: [{ name: 'מקצוע', units: ['אחרת'] }] }, quizzes: [q1] });
  assert.ok(rm.errors.some((e) => e.includes('מבחן ראשון') && e.includes('q-one')));
  const rmSubject = planStructure({ catalog: { subjects: [{ name: 'אחר' }] }, quizzes: [q1] });
  assert.ok(rmSubject.errors.some((e) => e.includes('מבחן ראשון')));
  const empty = planStructure({ catalog: { subjects: [{ name: 'מקצוע', units: ['יחידה', 'ריקה'] }] }, quizzes: [q1] });
  const ok = planStructure({ catalog: { subjects: [{ name: 'מקצוע', units: ['יחידה'] }] }, quizzes: [q1] });
  assert.deepEqual(empty.errors, []); assert.deepEqual(ok.errors, [], 'removing an empty unit is allowed');
});

test('plan quiz edit: details and move; id and unknown keys refused; no-op refused', () => {
  const catalog2 = { subjects: [{ name: 'מקצוע', units: ['יחידה', 'אחרת'] }] };
  const q = { ...quizIn('q-one', 'מקצוע', 'יחידה', 'ישן') };
  const plan = planQuizEdit({ id: 'q-one', patch: { title: ' חדש ', description: 'תיאור', unit: 'אחרת' }, catalog: catalog2, quizzes: [q] });
  assert.deepEqual(plan.errors, []);
  const out = JSON.parse(plan.files[0].text);
  assert.equal(out.title, 'חדש'); assert.equal(out.unit, 'אחרת'); assert.equal(out.id, 'q-one');
  assert.equal(out.questions.length, q.questions.length, 'questions untouched');
  assert.equal(JSON.parse(plan.files[1].text).subjects[0].units[1].quizzes[0].title, 'חדש');
  assert.ok(planQuizEdit({ id: 'q-one', patch: { id: 'renamed' }, catalog: catalog2, quizzes: [q] }).errors.some((e) => /קבוע/.test(e)));
  assert.ok(planQuizEdit({ id: 'q-one', patch: { questions: [] }, catalog: catalog2, quizzes: [q] }).errors.length > 0);
  assert.ok(planQuizEdit({ id: 'q-one', patch: { unit: 'אין' }, catalog: catalog2, quizzes: [q] }).errors.length > 0);
  assert.ok(planQuizEdit({ id: 'q-one', patch: { title: '' }, catalog: catalog2, quizzes: [q] }).errors.length > 0, 'title is required');
  assert.ok(planQuizEdit({ id: 'q-one', patch: { title: 'ישן' }, catalog: catalog2, quizzes: [q] }).errors.some((e) => /שינוי/.test(e)));
  assert.ok(planQuizEdit({ id: 'nope', patch: { title: 'x' }, catalog: catalog2, quizzes: [q] }).errors.length > 0);
  const noDesc = planQuizEdit({ id: 'q-one', patch: { description: '' }, catalog: catalog2, quizzes: [{ ...q, description: 'ישן' }] });
  assert.ok(!('description' in JSON.parse(noDesc.files[0].text)), 'empty description is removed');
});

test('plan summary delete / edit / order', async () => {
  const css = await readRepo('css/summary.css');
  const list = JSON.parse(await readRepo('summaries/list.json'));
  const withNew = planSummary({ html: page('<p>x</p>').replace('data-system="t"', 'data-system="tmp-one"'), id: 'tmp-one', title: 'זמני', blurb: 'ב', hue: 40, list, css });
  const list2 = JSON.parse(withNew.files[1].text); const css2 = withNew.files[2].text;

  const del = planSummaryDelete({ id: 'tmp-one', list: list2, css: css2 });
  assert.deepEqual(del.errors, []);
  assert.deepEqual(del.deletes, ['summaries/tmp-one.html']);
  assert.deepEqual(JSON.parse(del.files[0].text), list, 'list back to the original');
  assert.equal(del.files[1].text, css, 'accent removed, css back to the original');
  assert.ok(planSummaryDelete({ id: 'nope', list, css }).errors.length > 0);
  assert.ok(planSummaryDelete({ id: '../x', list, css }).errors.length > 0);
  const legacy = planSummaryDelete({ id: 'digestive', list, css });
  assert.ok(!legacy.files.find((f) => f.path === 'css/summary.css').text.includes('data-system="digestive"]  '), 'hand-written accent line removed too');

  const edit = planSummaryEdit({ id: 'tmp-one', title: 'כותרת חדשה', blurb: 'תיאור חדש', hue: 300, list: list2, css: css2 });
  assert.deepEqual(edit.errors, []);
  assert.equal(JSON.parse(edit.files[0].text).summaries.at(-1).title, 'כותרת חדשה');
  assert.equal(readSummaryHue(edit.files[1].text, 'tmp-one'), 300);
  const noHue = planSummaryEdit({ id: 'cardiovascular', title: 'כותרת', blurb: 'תיאור', list, css });
  assert.deepEqual(noHue.files.map((f) => f.path), ['summaries/list.json'], 'no hue chosen: css untouched');
  assert.ok(planSummaryEdit({ id: 'cardiovascular', title: list.summaries[0].title, blurb: list.summaries[0].blurb, list, css }).errors.some((e) => /שינוי/.test(e)));
  assert.ok(planSummaryEdit({ id: 'cardiovascular', title: ' ', blurb: 'x', list, css }).errors.length > 0);

  const ids = list.summaries.map((s) => s.id);
  const rev = planSummaryOrder({ order: [...ids].reverse(), list });
  assert.deepEqual(JSON.parse(rev.files[0].text).summaries.map((s) => s.id), [...ids].reverse());
  for (const bad of [ids.slice(1), [...ids, 'extra'], [ids[0], ids[0], ...ids.slice(2)], ids, 'x', null]) {
    assert.ok(planSummaryOrder({ order: bad, list }).errors.length > 0, JSON.stringify(bad));
  }
});

test('every Phase 1.5 plan writes only allowlisted paths and commits once without force', async () => {
  const css = await readRepo('css/summary.css');
  const list = JSON.parse(await readRepo('summaries/list.json'));
  const q = { ...quizIn('q-one', 'מקצוע', 'יחידה', 'א') };
  const cat = { subjects: [{ name: 'מקצוע', units: ['יחידה', 'אחרת'] }] };
  const plans = [
    planQuizEdit({ id: 'q-one', patch: { unit: 'אחרת' }, catalog: cat, quizzes: [q] }),
    planStructure({ catalog: { subjects: [{ name: 'מקצוע 2', units: ['יחידה', 'אחרת'] }] }, renames: { subjects: { מקצוע: 'מקצוע 2' } }, quizzes: [q] }),
    planSummaryDelete({ id: 'digestive', list, css }),
    planSummaryEdit({ id: 'endocrine', title: 'ט', blurb: 'ב', hue: 5, list, css }),
    planSummaryOrder({ order: list.summaries.map((s) => s.id).reverse(), list }),
  ];
  for (const plan of plans) {
    assert.deepEqual(plan.errors, []);
    for (const p of [...plan.files.map((f) => f.path), ...(plan.deletes ?? [])]) assert.ok(isWritablePath(p), p);
    const { fetchImpl, log } = fakeGithub();
    await createGithub({ token: 't', owner: 'o', repo: 'r', fetchImpl }).change(async () => plan, 'm');
    assert.equal(log.filter((r) => r.path.endsWith('/git/commits') && r.method === 'POST').length, 1);
    assert.equal(JSON.parse(log.at(-1).body).force, false);
  }
});

// ---------- Phase 2: flashcard decks in the panel ----------
const deckCat = { subjects: [{ name: 'מקצוע', units: ['יחידה', 'אחרת'] }] };
const deckSrc = (id = 'new-deck', extra = {}) => ({
  id, subject: 'מקצוע', unit: 'יחידה', title: 'חפיסה חדשה',
  cards: [{ id: 'c1', front: 'חזית מדומה', back: 'גב מדומה', topic: 'נושא' }, { id: 'c2', front: 'עוד חזית', back: 'עוד גב' }],
  ...extra,
});
const makeDeck = (id = 'new-deck', extra = {}) => JSON.parse(planDeck({ source: deckSrc(id, extra), catalog: deckCat, decks: [] }).files[0].text);

test('deck paths are allowlisted like quizzes, with the same id rules', () => {
  assert.ok(isWritablePath('flashcards/my-deck.json'));
  for (const bad of ['flashcards/../x.json', 'flashcards/A.json', 'flashcards/a/b.json', 'flashcards/manifest.json', 'flashcards/list.json', 'flashcards/x.html', 'flashcards/.json', '/flashcards/a.json']) {
    assert.ok(!isWritablePath(bad), bad);
  }
});

test('plan deck: add, manifest has it, duplicates / bad placement / unknown keys / bad ids refused', () => {
  const plan = planDeck({ source: deckSrc(), catalog: deckCat, decks: [] });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.files.map((f) => f.path), ['flashcards/new-deck.json', 'quizzes/manifest.json']);
  const m = JSON.parse(plan.files[1].text);
  assert.deepEqual(m.subjects[0].units[0].flashcards, [{ id: 'new-deck', title: 'חפיסה חדשה', description: '', cardCount: 2, topicCount: 2 }]);
  assert.match(plan.summary, /חפיסה "חפיסה חדשה" \(2 כרטיסיות\)/);
  const stored = JSON.parse(plan.files[0].text);

  assert.ok(planDeck({ source: deckSrc(), catalog: deckCat, decks: [stored] }).errors.some((e) => /כבר קיים/.test(e)));
  assert.deepEqual(planDeck({ source: deckSrc(), catalog: deckCat, decks: [stored], replace: true }).errors, []);
  assert.ok(planDeck({ source: deckSrc(), overrides: { unit: 'אין' }, catalog: deckCat, decks: [] }).errors.length > 0);
  assert.ok(planDeck({ source: deckSrc('../evil'), catalog: deckCat, decks: [] }).errors.length > 0);
  assert.ok(planDeck({ source: { ...deckSrc(), isAdmin: true }, catalog: deckCat, decks: [] }).errors.length > 0);
  assert.ok(planDeck({ source: deckSrc('manifest'), catalog: deckCat, decks: [] }).errors.length > 0, 'reserved id');
  assert.ok(planDeck({ source: { ...deckSrc(), cards: [] }, catalog: deckCat, decks: [] }).errors.length > 0);
  assert.ok(planDeck({ source: { questions: [] }, catalog: deckCat, decks: [] }).errors.length > 0, 'a quiz file is not a deck');
  const html = planDeck({ source: deckSrc('html-deck', { cards: [{ id: 'c1', front: '<script>alert(1)</script>', back: '<img src=x onerror=1>' }] }), catalog: deckCat, decks: [] });
  assert.deepEqual(html.errors, [], 'markup in card text is allowed: the player renders it as plain text');
});

test('plan deck edit / delete: details and move; id immutable; manifest stays right', () => {
  const d = makeDeck();
  const edit = planDeckEdit({ id: 'new-deck', patch: { title: ' חדש ', description: 'תיאור', unit: 'אחרת' }, catalog: deckCat, decks: [d] });
  assert.deepEqual(edit.errors, []);
  const out = JSON.parse(edit.files[0].text);
  assert.equal(out.title, 'חדש'); assert.equal(out.unit, 'אחרת'); assert.equal(out.cards.length, 2, 'cards untouched');
  assert.equal(JSON.parse(edit.files[1].text).subjects[0].units[1].flashcards[0].title, 'חדש');
  assert.ok(planDeckEdit({ id: 'new-deck', patch: { id: 'x' }, catalog: deckCat, decks: [d] }).errors.some((e) => /קבוע/.test(e)));
  assert.ok(planDeckEdit({ id: 'new-deck', patch: { cards: [] }, catalog: deckCat, decks: [d] }).errors.length > 0);
  assert.ok(planDeckEdit({ id: 'new-deck', patch: { title: d.title }, catalog: deckCat, decks: [d] }).errors.some((e) => /שינוי/.test(e)));
  assert.ok(planDeckEdit({ id: 'nope', patch: { title: 'x' }, catalog: deckCat, decks: [d] }).errors.length > 0);

  const del = planDeckDelete({ id: 'new-deck', catalog: deckCat, decks: [d] });
  assert.deepEqual(del.deletes, ['flashcards/new-deck.json']);
  assert.deepEqual(JSON.parse(del.files[0].text).subjects[0].units[0].flashcards, []);
  assert.ok(planDeckDelete({ id: 'nope', catalog: deckCat, decks: [d] }).errors.length > 0);
});

test('a deck and a quiz can share an id (separate folders)', () => {
  const q = JSON.parse(planQuiz({ source: authoring('same-id'), catalog: { subjects: [{ name: 'מקצוע', units: ['יחידה'] }] }, quizzes: [] }).files[0].text);
  const d = makeDeck('same-id');
  assert.deepEqual(planDeck({ source: deckSrc('same-id', { title: 'אחר' }), catalog: deckCat, decks: [], quizzes: [q] }).errors, []);
  assert.deepEqual(planQuiz({ source: authoring('same-id'), catalog: deckCat, quizzes: [], decks: [d] }).errors, []);
});

test('structure: renames cascade into decks too; removing a unit that holds only a deck is blocked', () => {
  const q = JSON.parse(planQuiz({ source: authoring('q-one'), catalog: deckCat, quizzes: [] }).files[0].text);
  const d = makeDeck();
  const after = { subjects: [{ name: 'מקצוע 2', units: ['יחידה חדשה', 'אחרת'] }] };
  const plan = planStructure({ catalog: after, renames: { subjects: { מקצוע: 'מקצוע 2' }, units: { מקצוע: { יחידה: 'יחידה חדשה' } } }, quizzes: [q], decks: [d] });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.files.map((f) => f.path), ['quizzes/subjects.json', 'quizzes/q-one.json', 'flashcards/new-deck.json', 'quizzes/manifest.json']);
  const movedDeck = JSON.parse(plan.files[2].text);
  assert.equal(movedDeck.subject, 'מקצוע 2'); assert.equal(movedDeck.unit, 'יחידה חדשה');
  assert.equal(JSON.parse(plan.files[3].text).subjects[0].units[0].flashcards[0].id, 'new-deck');
  assert.match(plan.summary, /1 מבחנים ו1 חפיסות/);

  const blocked = planStructure({ catalog: { subjects: [{ name: 'מקצוע', units: ['אחרת'] }] }, quizzes: [], decks: [d] });
  assert.ok(blocked.errors.some((e) => e.includes('חפיסה חדשה') && e.includes('new-deck')), 'names the deck that blocks the removal');
  const rmSubject = planStructure({ catalog: { subjects: [{ name: 'אחר' }] }, quizzes: [], decks: [d] });
  assert.ok(rmSubject.errors.length > 0);
});

test('EVERY plan that writes the manifest keeps the decks in it', async () => {
  const q = JSON.parse(planQuiz({ source: authoring('q-one'), catalog: deckCat, quizzes: [] }).files[0].text);
  const d = makeDeck();
  const withDeck = (plan) => {
    const m = plan.files.find((f) => f.path === 'quizzes/manifest.json');
    assert.ok(m, 'plan writes a manifest');
    assert.ok(JSON.parse(m.text).subjects[0].units.flatMap((u) => u.flashcards).some((x) => x.id === 'new-deck'), 'the deck is still in the manifest');
  };
  withDeck(planQuiz({ source: authoring('q-two'), catalog: deckCat, quizzes: [q], decks: [d] }));
  withDeck(planQuiz({ source: authoring('q-one'), catalog: deckCat, quizzes: [q], decks: [d], replace: true }));
  withDeck(planQuizEdit({ id: 'q-one', patch: { title: 'שונה' }, catalog: deckCat, quizzes: [q], decks: [d] }));
  withDeck(planQuizDelete({ id: 'q-one', catalog: deckCat, quizzes: [q], decks: [d] }));
  withDeck(planStructure({ catalog: { subjects: [{ name: 'מקצוע', units: ['יחידה', 'אחרת', 'שלישית'] }] }, quizzes: [q], decks: [d] }));
  withDeck(planDeck({ source: deckSrc('another'), catalog: deckCat, decks: [d], quizzes: [q] }));
  withDeck(planDeckEdit({ id: 'new-deck', patch: { title: 'שונה' }, catalog: deckCat, decks: [d], quizzes: [q] }));
  // and a quiz kept when a deck is deleted
  const del = planDeckDelete({ id: 'new-deck', catalog: deckCat, decks: [d], quizzes: [q] });
  assert.equal(JSON.parse(del.files[0].text).subjects[0].units[0].quizzes.length, 1);
  // the helper is the single source of manifest text
  assert.equal(manifestFile([q], [d], deckCat).text, planQuizEdit({ id: 'q-one', patch: { title: q.title + 'x' }, catalog: deckCat, quizzes: [q], decks: [d] }).files[1].text.replace(/"title": "[^"]*x"/, `"title": "${q.title}"`));
  // none of them can ever be asked to build one without decks by accident: old callers get decks = []
  assert.equal(JSON.parse(planQuiz({ source: authoring('q-three'), catalog: deckCat, quizzes: [] }).files[1].text).subjects[0].units[0].flashcards.length, 0);
});

test('deck plans only write allowlisted paths in one non-forced commit', async () => {
  const d = makeDeck();
  const plans = [
    planDeck({ source: deckSrc('second'), catalog: deckCat, decks: [d] }),
    planDeckEdit({ id: 'new-deck', patch: { unit: 'אחרת' }, catalog: deckCat, decks: [d] }),
    planDeckDelete({ id: 'new-deck', catalog: deckCat, decks: [d] }),
  ];
  for (const plan of plans) {
    assert.deepEqual(plan.errors, []);
    for (const p of [...plan.files.map((f) => f.path), ...(plan.deletes ?? [])]) assert.ok(isWritablePath(p), p);
    const { fetchImpl, log } = fakeGithub();
    await createGithub({ token: 't', owner: 'o', repo: 'r', fetchImpl }).change(async () => plan, 'm');
    assert.equal(log.filter((r) => r.path.endsWith('/git/commits') && r.method === 'POST').length, 1);
    assert.equal(JSON.parse(log.at(-1).body).force, false);
  }
});

test('the flashcards template is a valid, placeable deck and uploads cleanly', async () => {
  const read = (f) => readFile(new URL(`../templates/${f}`, import.meta.url), 'utf8');
  const catalog = JSON.parse(await read('subjects.json'));
  const source = JSON.parse(await read('flashcards.json'));
  const plan = planDeck({ source, catalog, decks: [] });
  assert.deepEqual(plan.errors, []);
  assert.equal(JSON.parse(plan.files[0].text).cards.length, 3);
  assert.ok(checkUpload({ name: 'flashcards.json', size: 900, bytes: bytes(await read('flashcards.json')) }).errors.length === 0);
});
