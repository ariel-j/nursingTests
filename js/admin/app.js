// Admin panel. Unlocks the GitHub token with a password, then turns uploads into one atomic commit.
// DOM is built with textContent only (never innerHTML). The token lives in a closure, never in storage.
import { load, save, remove } from '../storage.js';
import { ADMIN_SEEN_KEY } from '../admin-link.js';
import { backoffMs, looksLikeToken, open, passwordProblems, seal } from './vault.js';
import { createGithub } from './github.js';
import { checkUpload, readSummaryHue } from './uploads.js';
import {
  planQuiz, planQuizDelete, planQuizEdit, planStructure, planSummary, planSummaryDelete, planSummaryEdit,
  planSummaryOrder, readQuizzes,
} from './actions.js';

const VAULT_KEY = 'admin-vault';
const IDLE_MS = 10 * 60 * 1000;
const root = document.getElementById('admin-root');
const statusEl = document.getElementById('admin-status');
const titleEl = document.getElementById('admin-title');

let session = null; // { gh, repo } while unlocked
let idleTimer = null;
let failures = 0;
let activeTab = 'overview';
let pendingBanner = null; // shown once at the top after a publish, then the tab reloads its lists

// ---------- tiny DOM helpers ----------
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'onclick') node.addEventListener('click', v);
    else if (k === 'onchange') node.addEventListener('change', v);
    else if (k === 'oninput') node.addEventListener('input', v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined));
  return node;
}
const say = (text) => { statusEl.textContent = text; };
const field = (id, label, input, hint) =>
  el('div', { class: 'admin-field' }, el('label', { for: id, text: label }), input, hint ? el('span', { class: 'hint', text: hint }) : null);
const button = (text, onclick, extra = {}) => el('button', { type: 'button', text, onclick, ...extra });
const errorsBox = (errors) =>
  el('div', { class: 'admin-errors', role: 'alert' }, el('ul', {}, errors.map((e) => el('li', { text: e }))));

async function guarded(fn, out) {
  try {
    await fn();
  } catch (err) {
    out.replaceChildren(errorsBox([err.message]));
  }
}

// ---------- locking ----------
function lock(message = 'הפאנל ננעל.') {
  session = null;
  clearTimeout(idleTimer);
  say(message);
  boot();
}
function touch() {
  if (!session) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => lock('הפאנל ננעל אחרי 10 דקות ללא פעילות.'), IDLE_MS);
}
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, touch, true);
window.addEventListener('pagehide', () => { session = null; });

// ---------- setup / unlock ----------
function renderSetup() {
  titleEl.textContent = 'הגדרה ראשונית';
  const owner = el('input', { type: 'text', id: 's-owner', value: 'ariel-j', autocomplete: 'off', dir: 'ltr' });
  const repo = el('input', { type: 'text', id: 's-repo', value: 'nursingTests', autocomplete: 'off', dir: 'ltr' });
  const branch = el('input', { type: 'text', id: 's-branch', value: 'main', autocomplete: 'off', dir: 'ltr' });
  const token = el('input', { type: 'password', id: 's-token', autocomplete: 'off', dir: 'ltr' });
  const pw = el('input', { type: 'password', id: 's-pw', autocomplete: 'new-password' });
  const pw2 = el('input', { type: 'password', id: 's-pw2', autocomplete: 'new-password' });
  const meterFill = el('span');
  const meter = el('div', { class: 'admin-meter', 'aria-hidden': 'true' }, meterFill);
  const hint = el('p', { class: 'admin-note', 'aria-live': 'polite' });
  const out = el('div');

  pw.addEventListener('input', () => {
    const problems = passwordProblems(pw.value);
    meterFill.style.inlineSize = `${Math.min(100, Math.round((pw.value.length / 16) * 100))}%`;
    meter.dataset.level = problems.length === 0 ? 'ok' : 'weak';
    hint.textContent = problems.length === 0 ? 'סיסמה חזקה מספיק.' : `נדרש: ${problems.join(' · ')}`;
  });

  const submit = async () => {
    out.replaceChildren();
    const errors = [];
    if (!looksLikeToken(token.value)) errors.push('הטוקן אינו נראה כטוקן של GitHub (github_pat_…)');
    errors.push(...passwordProblems(pw.value).map((p) => `סיסמה: ${p}`));
    if (pw.value !== pw2.value) errors.push('אימות הסיסמה אינו תואם');
    if (errors.length > 0) return out.replaceChildren(errorsBox(errors));
    say('בודק גישה ל‑GitHub…');
    const repoInfo = { owner: owner.value.trim(), name: repo.value.trim(), branch: branch.value.trim() || 'main' };
    const gh = createGithub({ token: token.value.trim(), owner: repoInfo.owner, repo: repoInfo.name, branch: repoInfo.branch });
    const info = await gh.ping();
    if (!info.permissions?.push) throw new Error('לטוקן אין הרשאת כתיבה למאגר (נדרש Contents: Read and write)');
    say('מצפין את הטוקן…');
    const sealed = await seal(token.value.trim(), pw.value);
    save(VAULT_KEY, { repo: repoInfo, sealed });
    token.value = ''; pw.value = ''; pw2.value = '';
    save(ADMIN_SEEN_KEY, true);
    session = { gh, repo: repoInfo };
    touch();
    say('הטוקן נשמר מוצפן בדפדפן הזה בלבד.');
    renderPanel();
  };

  root.replaceChildren(
    el('section', { class: 'admin-card' },
      el('h2', { text: 'חיבור ל‑GitHub' }),
      el('p', { text: 'הפאנל מפרסם שינויים כ‑commit למאגר דרך ה‑API של GitHub. כדי לעשות זאת צריך טוקן אישי (Fine-grained personal access token) שמוגבל למאגר הזה בלבד, עם הרשאת Contents: Read and write ובתוקף של עד 90 יום.' }),
      el('p', { class: 'admin-note', text: 'הסיסמה אינה "מנעול" של האתר: היא מצפינה את הטוקן בדפדפן שלכם. ההגנה האמיתית היא הטוקן ש‑GitHub בודק. מי שאין לו טוקן לא יכול לשנות כלום.' }),
      el('div', { class: 'admin-grid' },
        field('s-owner', 'בעלים (owner)', owner),
        field('s-repo', 'שם המאגר', repo),
        field('s-branch', 'ענף', branch)),
      field('s-token', 'טוקן GitHub', token, 'לא נשמר בצורה גלויה, ולא נשלח לשום מקום חוץ מ‑api.github.com.'),
      field('s-pw', 'סיסמה חדשה להצפנת הטוקן', pw, 'לפחות 12 תווים, אותיות וספרות.'),
      meter, hint,
      field('s-pw2', 'אימות סיסמה', pw2),
      button('שמירה והתחברות', () => guarded(submit, out)),
      out));
  titleEl.focus();
}

function renderUnlock(vault) {
  titleEl.textContent = 'כניסה לניהול';
  const pw = el('input', { type: 'password', id: 'u-pw', autocomplete: 'current-password' });
  const out = el('div');
  const unlock = button('פתיחה', async () => {
    out.replaceChildren();
    const wait = backoffMs(failures);
    if (wait > 0) {
      unlock.disabled = true;
      say(`נסו שוב בעוד ${Math.ceil(wait / 1000)} שניות.`);
      setTimeout(() => { unlock.disabled = false; }, wait);
      return;
    }
    say('פותח…');
    try {
      const token = await open(vault.sealed, pw.value);
      failures = 0;
      pw.value = '';
      session = { gh: createGithub({ token, owner: vault.repo.owner, repo: vault.repo.name, branch: vault.repo.branch }), repo: vault.repo };
      save(ADMIN_SEEN_KEY, true);
      touch();
      say('');
      renderPanel();
    } catch (err) {
      failures += 1;
      say('');
      out.replaceChildren(errorsBox([err.message]));
    }
  });
  const forget = button('מחיקת הטוקן מהדפדפן הזה', () => {
    if (confirm('למחוק את הטוקן המוצפן מהדפדפן הזה? תצטרכו להזין טוקן חדש.')) {
      remove(VAULT_KEY);
      remove(ADMIN_SEEN_KEY);
      boot();
    }
  }, { class: 'secondary' });
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock.click(); });

  root.replaceChildren(
    el('section', { class: 'admin-card' },
      el('p', { class: 'admin-note', text: `מאגר: ${vault.repo.owner}/${vault.repo.name} · ענף ${vault.repo.branch}` }),
      field('u-pw', 'סיסמה', pw),
      el('div', { class: 'admin-row' }, unlock, forget),
      out));
  pw.focus();
}

// ---------- repo state + the shared review/publish flow ----------
async function loadState(snap) {
  const [catalog, list, css, quizzes] = await Promise.all([
    snap.readText('quizzes/subjects.json').then(JSON.parse),
    snap.readText('summaries/list.json').then(JSON.parse),
    snap.readText('css/summary.css'),
    readQuizzes(snap),
  ]);
  return { catalog, list, css, quizzes };
}

function publishedBanner(text, sha) {
  const url = `https://github.com/${session.repo.owner}/${session.repo.name}/commit/${sha}`;
  return el('div', { class: 'admin-ok', role: 'status', tabindex: '-1', id: 'admin-banner' },
    `פורסם: ${text}. האתר יתעדכן בעוד דקה‑שתיים. `,
    el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: 'הצגת ה‑commit' }));
}

/** Reloads the current tab (so its lists show the new state) with a success banner on top. */
function refresh(banner) {
  pendingBanner = banner;
  renderPanel(activeTab);
}

/** Typed-id confirmation, then one commit built from fresh state. Used for every delete. */
async function confirmedChange({ word, prompt: text, makePlan, message, out }) {
  if (prompt(`${text}\nלאישור הקלידו: ${word}`) !== word) return;
  document.getElementById('admin-banner')?.remove();
  await guarded(async () => {
    say('מפרסם…');
    const { sha, plan } = await session.gh.change(async (api) => {
      const plan = makePlan(await loadState(api));
      if (plan.errors.length > 0) throw new Error(plan.errors.join(' · '));
      return plan;
    }, message);
    say('');
    refresh(publishedBanner(plan.summary ?? message, sha));
  }, out);
}

/**
 * Shows what will change and, after the owner confirms, commits it. `makePlan(state)` is called on the
 * state at preview time and again, on fresh state, at commit time (so a push in between cannot be lost).
 */
function reviewFlow(makePlan, message, { needsOwnContentConfirm = true } = {}) {
  const out = el('div');
  const confirmBox = el('input', { type: 'checkbox', id: `own-${Math.random().toString(36).slice(2)}` });
  const publishBtn = button('פרסום באתר', () => guarded(async () => {
    publishBtn.disabled = true;
    say('מפרסם…');
    const { sha, plan } = await session.gh.change(async (api) => {
      const plan = makePlan(await loadState(api));
      if (plan.errors.length > 0) throw new Error(plan.errors.join(' · '));
      return plan;
    }, message);
    say('');
    refresh(publishedBanner(plan.summary ?? message, sha));
  }, out), { disabled: true });

  const review = async () => {
    document.getElementById('admin-banner')?.remove();
    out.replaceChildren();
    say('בודק מול המאגר…');
    const snap = await session.gh.snapshot();
    const state = await loadState(snap);
    const plan = makePlan(state);
    say('');
    if (plan.errors.length > 0) return out.replaceChildren(errorsBox(plan.errors));
    const existing = new Set(await snap.listFiles());
    const rows = [
      ...plan.files.map((f) => el('li', {}, existing.has(f.path) ? 'עדכון: ' : 'חדש: ', el('code', { text: f.path }))),
      ...(plan.deletes ?? []).map((p) => el('li', {}, 'מחיקה: ', el('code', { text: p }))),
    ];
    const confirm = needsOwnContentConfirm
      ? el('div', { class: 'admin-check' }, confirmBox,
        el('label', { for: confirmBox.id, text: 'התוכן הוא שלי (לא חומרי קורס של אחרים), ואני מאשר/ת לפרסם אותו באתר הציבורי.' }))
      : null;
    confirmBox.addEventListener('change', () => { publishBtn.disabled = !confirmBox.checked; });
    publishBtn.disabled = needsOwnContentConfirm;
    out.replaceChildren(
      el('div', { class: 'admin-ok', role: 'status', text: `הבדיקה עברה: ${plan.summary ?? 'שינוי'}. יתבצע commit אחד עם הקבצים:` }),
      el('ul', { class: 'admin-files' }, rows), confirm, publishBtn);
  };
  return { out, reviewBtn: button('בדיקה ותצוגה מקדימה', () => guarded(review, out)) };
}

async function readFileChecked(file, out) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const { kind, errors } = checkUpload({ name: file.name, size: file.size, bytes: buf });
  if (errors.length > 0) {
    out.replaceChildren(errorsBox(errors));
    return null;
  }
  return { kind, text: new TextDecoder('utf-8', { fatal: true }).decode(buf) };
}

// ---------- tabs ----------
async function tabOverview(host) {
  say('טוען…');
  const state = await loadState(await session.gh.snapshot());
  say('');
  const count = (q) => state.quizzes.filter(q).length;
  host.replaceChildren(
    el('div', { class: 'admin-grid' },
      el('div', { class: 'admin-card' }, el('h3', { text: 'מבחנים' }), el('p', { text: String(state.quizzes.length) })),
      el('div', { class: 'admin-card' }, el('h3', { text: 'סיכומים' }), el('p', { text: String(state.list.summaries.length) })),
      el('div', { class: 'admin-card' }, el('h3', { text: 'נושאים' }), el('p', { text: String(state.catalog.subjects.length) }))),
    el('section', { class: 'admin-card' },
      el('h2', { text: 'מבנה האתר' }),
      state.catalog.subjects.map((s) => el('div', {},
        el('h3', { text: s.name }),
        el('ul', {}, (s.units ?? []).map((u) => {
          const n = count((q) => q.subject === s.name && q.unit === u);
          return el('li', { text: n === 0 ? `${u} · בקרוב` : `${u} · ${n} מבחנים` });
        }))))),
    el('section', { class: 'admin-card' },
      el('h2', { text: 'בקרוב' }),
      el('p', { class: 'admin-note', text: 'כרטיסיות (פלאשקארדס) וסרטונים יתווספו בשלבים הבאים, אחרי שיהיו להם דפי תצוגה באתר.' })));
}

async function tabStructure(host) {
  say('טוען…');
  const state = await loadState(await session.gh.snapshot());
  say('');
  // Every item remembers the name it had (`from`), so a rename can be cascaded into its quizzes.
  const draft = state.catalog.subjects.map((s) => ({
    name: s.name,
    from: s.name,
    units: (s.units ?? []).map((u) => ({ name: u, from: u })),
  }));
  const area = el('div');
  const countIn = (subject, unit) => state.quizzes.filter((q) => q.subject === subject && (unit === undefined || q.unit === unit)).length;
  const move = (arr, i, d) => { const j = i + d; if (j >= 0 && j < arr.length) [arr[i], arr[j]] = [arr[j], arr[i]]; };
  const note = (from, unit) => {
    const n = from === null ? 0 : countIn(from, unit);
    return n > 0 ? el('span', { class: 'admin-note', text: `${n} מבחנים` }) : null;
  };

  const draw = () => {
    area.replaceChildren(...draft.map((s, si) => el('section', { class: 'admin-card' },
      el('div', { class: 'admin-row' },
        el('input', { type: 'text', value: s.name, 'aria-label': 'שם נושא', oninput: (e) => { s.name = e.target.value; } }),
        note(s.from),
        button('↑', () => { move(draft, si, -1); draw(); }, { 'aria-label': 'העלאת נושא', class: 'secondary' }),
        button('↓', () => { move(draft, si, 1); draw(); }, { 'aria-label': 'הורדת נושא', class: 'secondary' }),
        button('הסרת נושא', () => { draft.splice(si, 1); draw(); }, { class: 'secondary' })),
      el('div', { class: 'admin-units' },
        s.units.map((u, ui) => el('div', { class: 'admin-row' },
          el('input', { type: 'text', value: u.name, 'aria-label': 'שם יחידה', oninput: (e) => { u.name = e.target.value; } }),
          note(s.from, u.from),
          button('↑', () => { move(s.units, ui, -1); draw(); }, { 'aria-label': 'העלאת יחידה', class: 'secondary' }),
          button('↓', () => { move(s.units, ui, 1); draw(); }, { 'aria-label': 'הורדת יחידה', class: 'secondary' }),
          button('הסרה', () => { s.units.splice(ui, 1); draw(); }, { class: 'secondary' }))),
        button('+ יחידה', () => { s.units.push({ name: 'יחידה חדשה', from: null }); draw(); }, { class: 'secondary' })))),
    button('+ נושא', () => { draft.push({ name: 'נושא חדש', from: null, units: [] }); draw(); }, { class: 'secondary' }));
  };
  draw();

  // The catalog to publish, and the renames to cascade into quizzes (units keyed by the OLD subject name).
  const build = () => {
    const renames = { subjects: {}, units: {} };
    const catalog = {
      subjects: draft.map((s) => {
        const name = s.name.trim();
        if (s.from !== null && name !== s.from) renames.subjects[s.from] = name;
        const units = s.units.map((u) => {
          const unit = u.name.trim();
          if (s.from !== null && u.from !== null && unit !== u.from) (renames.units[s.from] ??= {})[u.from] = unit;
          return unit;
        });
        return units.length > 0 ? { name, units } : { name };
      }),
    };
    return { catalog, renames };
  };

  const flow = reviewFlow((st) => planStructure({ ...build(), quizzes: st.quizzes }), 'ניהול: עדכון נושאים', { needsOwnContentConfirm: false });
  host.replaceChildren(
    el('p', { class: 'admin-note', text: 'שינוי שם של נושא או יחידה מתעדכן אוטומטית בכל המבחנים שבהם, באותו commit. אי אפשר להסיר נושא או יחידה שיש בהם מבחנים: העבירו או מחקו אותם קודם בלשונית "מבחנים". מתחת לכל שם מופיע מספר המבחנים שבו.' }),
    area, el('div', { class: 'admin-row' }, flow.reviewBtn), flow.out);
}

function quizEditForm(q, state) {
  const k = `qe-${q.id}`;
  const title = el('input', { type: 'text', id: `${k}-title`, value: q.title, autocomplete: 'off' });
  const description = el('input', { type: 'text', id: `${k}-desc`, value: q.description ?? '', autocomplete: 'off' });
  const subject = el('select', { id: `${k}-subject` }, state.catalog.subjects.map((s) => el('option', { value: s.name, text: s.name })));
  const unit = el('select', { id: `${k}-unit` });
  subject.value = q.subject;
  const fillUnits = (selected) => {
    const units = state.catalog.subjects.find((s) => s.name === subject.value)?.units ?? [];
    unit.replaceChildren(...(units.length ? units : ['']).map((u) => el('option', { value: u, text: u || '— אין יחידות —' })));
    unit.disabled = units.length === 0;
    if (selected && units.includes(selected)) unit.value = selected;
  };
  subject.addEventListener('change', () => fillUnits());
  fillUnits(q.unit);
  const flow = reviewFlow((st) => planQuizEdit({
    id: q.id,
    patch: { title: title.value, description: description.value, subject: subject.value, unit: unit.value },
    catalog: st.catalog,
    quizzes: st.quizzes,
  }), `ניהול: עריכת מבחן ${q.id}`, { needsOwnContentConfirm: false });
  return el('div', { class: 'admin-card' },
    el('p', { class: 'admin-note', text: 'המזהה קבוע (ההתקדמות של לומדים שמורה לפיו). לתיקון השאלות עצמן: הורידו את הקובץ, תקנו והעלו שוב עם "החלפה". שינוי כותרת משנה את מקום המבחן ברשימה, כי היא ממוינת לפי כותרת.' }),
    field(`${k}-title`, 'כותרת', title), field(`${k}-desc`, 'תיאור (אופציונלי)', description),
    field(`${k}-subject`, 'נושא', subject), field(`${k}-unit`, 'יחידה', unit),
    el('div', { class: 'admin-row' }, flow.reviewBtn), flow.out);
}

async function tabQuizzes(host) {
  say('טוען…');
  const state = await loadState(await session.gh.snapshot());
  say('');
  let source = null;
  const f = {};
  const inputOut = el('div');
  const mk = (id, label, hint) => { f[id] = el('input', { type: 'text', id: `q-${id}`, autocomplete: 'off' }); return field(`q-${id}`, label, f[id], hint); };
  f.subject = el('select', { id: 'q-subject' }, state.catalog.subjects.map((s) => el('option', { value: s.name, text: s.name })));
  f.unit = el('select', { id: 'q-unit' });
  f.replace = el('input', { type: 'checkbox', id: 'q-replace' });
  const fillUnits = (selected) => {
    const subj = state.catalog.subjects.find((s) => s.name === f.subject.value);
    const units = subj?.units ?? [];
    f.unit.replaceChildren(...(units.length ? units : ['']).map((u) => el('option', { value: u, text: u || '— אין יחידות —' })));
    f.unit.disabled = units.length === 0;
    if (selected && units.includes(selected)) f.unit.value = selected;
  };
  f.subject.addEventListener('change', () => fillUnits());
  fillUnits();

  const fileInput = el('input', { type: 'file', id: 'q-file', accept: '.json,application/json' });
  fileInput.addEventListener('change', () => guarded(async () => {
    inputOut.replaceChildren();
    source = null;
    const file = fileInput.files[0];
    if (!file) return;
    const read = await readFileChecked(file, inputOut);
    if (!read) return;
    if (read.kind !== 'json') return inputOut.replaceChildren(errorsBox(['נדרש קובץ JSON']));
    source = JSON.parse(read.text);
    f.id.value = source.id ?? '';
    f.title.value = source.title ?? '';
    f.description.value = source.description ?? '';
    if (state.catalog.subjects.some((s) => s.name === source.subject)) f.subject.value = source.subject;
    fillUnits(source.unit);
    inputOut.replaceChildren(el('p', { class: 'admin-ok', text: `נטען: ${source.questions?.length ?? 0} שאלות. אפשר לתקן את השדות לפני הבדיקה.` }));
  }, inputOut));

  const flow = reviewFlow((st) => {
    if (!source) return { files: [], errors: ['לא נבחר קובץ'] };
    return planQuiz({
      source,
      overrides: { id: f.id.value.trim(), title: f.title.value.trim(), description: f.description.value.trim(), subject: f.subject.value, unit: f.unit.value },
      catalog: st.catalog,
      quizzes: st.quizzes,
      replace: f.replace.checked,
    });
  }, 'ניהול: הוספת מבחן');

  const listOut = el('div');
  const list = el('ul', { class: 'admin-list' }, state.quizzes.map((q) => {
    const editHost = el('div', { hidden: true });
    const editBtn = button('עריכה', () => {
      if (editHost.hidden && editHost.childElementCount === 0) editHost.append(quizEditForm(q, state));
      editHost.hidden = !editHost.hidden;
      editBtn.setAttribute('aria-expanded', String(!editHost.hidden));
    }, { class: 'secondary', 'aria-expanded': 'false' });
    return el('li', {},
      `${q.title} (${q.id}) · ${q.subject}${q.unit ? ` › ${q.unit}` : ''} · ${q.questions.length} שאלות `,
      el('span', { class: 'admin-row' }, editBtn,
        button('מחיקה', () => confirmedChange({
          word: q.id,
          prompt: `מחיקת המבחן "${q.title}" היא סופית (ההתקדמות של לומדים בדפדפנים שלהם תישאר אבל לא תהיה מקושרת לכלום).`,
          makePlan: (st) => planQuizDelete({ id: q.id, catalog: st.catalog, quizzes: st.quizzes }),
          message: `ניהול: מחיקת מבחן ${q.id}`,
          out: listOut,
        }), { class: 'secondary' })),
      editHost);
  }));

  host.replaceChildren(
    el('section', { class: 'admin-card' },
      el('h2', { text: 'הוספת מבחן' }),
      el('p', { class: 'admin-note', text: 'קובץ JSON בפורמט האתר או בפורמט הכתיבה (correctIndex + wrongExplanations). בלשונית "תבניות" יש קבצים מוכנים.' }),
      field('q-file', 'קובץ מבחן (JSON)', fileInput), inputOut,
      mk('id', 'מזהה (אנגלית קטנה, ספרות ומקפים)', 'למשל heart-2. זה גם שם הקובץ.'),
      mk('title', 'כותרת'), mk('description', 'תיאור (אופציונלי)'),
      field('q-subject', 'נושא', f.subject), field('q-unit', 'יחידה', f.unit),
      el('div', { class: 'admin-check' }, f.replace, el('label', { for: 'q-replace', text: 'החלפה של מבחן קיים עם אותו מזהה' })),
      el('div', { class: 'admin-row' }, flow.reviewBtn), flow.out),
    el('section', { class: 'admin-card' }, el('h2', { text: 'מבחנים קיימים' }), list, listOut));
}

async function tabSummaries(host) {
  say('טוען…');
  const state = await loadState(await session.gh.snapshot());
  say('');
  let html = null;
  const inputOut = el('div');
  const f = {
    id: el('input', { type: 'text', id: 'su-id', autocomplete: 'off', dir: 'ltr' }),
    title: el('input', { type: 'text', id: 'su-title', autocomplete: 'off' }),
    blurb: el('input', { type: 'text', id: 'su-blurb', autocomplete: 'off' }),
    hue: el('input', { type: 'number', id: 'su-hue', min: '0', max: '359', value: '200' }),
    replace: el('input', { type: 'checkbox', id: 'su-replace' }),
  };
  const fileInput = el('input', { type: 'file', id: 'su-file', accept: '.html,.htm,text/html' });
  fileInput.addEventListener('change', () => guarded(async () => {
    inputOut.replaceChildren();
    html = null;
    const file = fileInput.files[0];
    if (!file) return;
    const read = await readFileChecked(file, inputOut);
    if (!read) return;
    if (read.kind !== 'html') return inputOut.replaceChildren(errorsBox(['נדרש קובץ HTML']));
    html = read.text;
    // DOMParser never runs scripts; used only to prefill the title.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    f.title.value = doc.querySelector('h1')?.textContent.trim() ?? '';
    f.id.value = file.name.replace(/\.html?$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    inputOut.replaceChildren(el('p', { class: 'admin-ok', text: 'נטען. השלימו מזהה, כותרת ותיאור.' }));
  }, inputOut));

  const flow = reviewFlow((st) => {
    if (html === null) return { files: [], errors: ['לא נבחר קובץ'] };
    return planSummary({ html, id: f.id.value.trim(), title: f.title.value, blurb: f.blurb.value, hue: f.hue.value, list: st.list, css: st.css, replace: f.replace.checked });
  }, 'ניהול: הוספת סיכום');

  host.replaceChildren(
    el('section', { class: 'admin-card' },
      el('h2', { text: 'הוספת סיכום' }),
      el('p', { class: 'admin-note', text: 'דף HTML בפורמט הסיכומים (ראו תבנית). הדף נבדק: בלי סקריפטים, טפסים, מסגרות או משאבים חיצוניים.' }),
      field('su-file', 'קובץ סיכום (HTML)', fileInput), inputOut,
      field('su-id', 'מזהה (אנגלית קטנה, ספרות ומקפים)', f.id, 'משמש כשם הקובץ וכצבע המבטא; ה‑data-system בדף יותאם אוטומטית.'),
      field('su-title', 'כותרת בדף הסיכומים', f.title),
      field('su-blurb', 'תיאור קצר (שורה אחת)', f.blurb),
      field('su-hue', 'גוון מבטא (0–359)', f.hue),
      el('div', { class: 'admin-check' }, f.replace, el('label', { for: 'su-replace', text: 'החלפה של סיכום קיים עם אותו מזהה' })),
      el('div', { class: 'admin-row' }, flow.reviewBtn), flow.out),
    manageSummaries(state));
}

function manageSummaries(state) {
  const order = state.list.summaries.map((x) => x.id);
  const byId = new Map(state.list.summaries.map((x) => [x.id, x]));
  const listEl = el('ul', { class: 'admin-list' });
  const out = el('div');
  const orderFlow = reviewFlow((st) => planSummaryOrder({ order, list: st.list }), 'ניהול: סדר הסיכומים', { needsOwnContentConfirm: false });
  const move = (i, d) => { const j = i + d; if (j >= 0 && j < order.length) [order[i], order[j]] = [order[j], order[i]]; };

  const draw = () => listEl.replaceChildren(...order.map((id, i) => {
    const sm = byId.get(id);
    const editHost = el('div', { hidden: true });
    const editBtn = button('עריכה', () => {
      if (editHost.hidden && editHost.childElementCount === 0) editHost.append(summaryEditForm(sm, state));
      editHost.hidden = !editHost.hidden;
      editBtn.setAttribute('aria-expanded', String(!editHost.hidden));
    }, { class: 'secondary', 'aria-expanded': 'false' });
    return el('li', {},
      `${sm.title} (${sm.id}) `,
      el('span', { class: 'admin-row' },
        button('↑', () => { move(i, -1); draw(); }, { 'aria-label': `העלאת ${sm.title}`, class: 'secondary' }),
        button('↓', () => { move(i, 1); draw(); }, { 'aria-label': `הורדת ${sm.title}`, class: 'secondary' }),
        editBtn,
        button('מחיקה', () => confirmedChange({
          word: sm.id,
          prompt: `מחיקת הסיכום "${sm.title}" מסירה את הדף שלו מהאתר (קישורים ששמורים אצל אנשים יפסיקו לעבוד).`,
          makePlan: (st) => planSummaryDelete({ id: sm.id, list: st.list, css: st.css }),
          message: `ניהול: מחיקת סיכום ${sm.id}`,
          out,
        }), { class: 'secondary' })),
      editHost);
  }));
  draw();
  return el('section', { class: 'admin-card' },
    el('h2', { text: 'סיכומים קיימים' }),
    el('p', { class: 'admin-note', text: 'הסדר כאן קובע את הסדר בדף הסיכומים ובקובץ ה‑PDF המאוחד. לשינוי תוכן הדף: העלו אותו שוב עם "החלפה" בטופס שלמעלה.' }),
    listEl,
    el('div', { class: 'admin-row' }, orderFlow.reviewBtn), orderFlow.out, out);
}

function summaryEditForm(sm, state) {
  const k = `se-${sm.id}`;
  const hueNow = readSummaryHue(state.css, sm.id);
  const title = el('input', { type: 'text', id: `${k}-title`, value: sm.title, autocomplete: 'off' });
  const blurb = el('input', { type: 'text', id: `${k}-blurb`, value: sm.blurb, autocomplete: 'off' });
  const hue = el('input', { type: 'number', id: `${k}-hue`, min: '0', max: '359', value: hueNow === null ? '' : String(hueNow) });
  const flow = reviewFlow((st) => planSummaryEdit({
    id: sm.id, title: title.value, blurb: blurb.value,
    hue: hue.value === '' || Number(hue.value) === hueNow ? undefined : hue.value,
    list: st.list, css: st.css,
  }), `ניהול: עריכת סיכום ${sm.id}`, { needsOwnContentConfirm: false });
  return el('div', { class: 'admin-card' },
    field(`${k}-title`, 'כותרת', title), field(`${k}-blurb`, 'תיאור קצר', blurb),
    field(`${k}-hue`, 'גוון מבטא (0–359)', hue, hueNow === null ? 'לסיכום הזה יש צבע שנקבע ידנית. השאירו ריק כדי לא לשנות אותו.' : undefined),
    el('div', { class: 'admin-row' }, flow.reviewBtn), flow.out);
}

const TEMPLATES = [
  { file: 'quiz-authoring.json', title: 'מבחן — פורמט כתיבה', note: 'אפשרויות כמחרוזות + correctIndex + wrongExplanations. הכי נוח לכתיבה/יצירה חיצונית.' },
  { file: 'quiz-site.json', title: 'מבחן — פורמט האתר', note: 'אפשרויות כאובייקטים {text, note} ו‑correct (0–3).' },
  { file: 'summary.html', title: 'סיכום — דף HTML', note: 'מבנה הסיכומים הקיימים (rel, def, exam…). data-system מותאם אוטומטית.' },
  { file: 'subjects.json', title: 'נושאים ויחידות — דוגמה', note: 'המבנה של קטלוג הנושאים. לעריכה יש להשתמש בלשונית "מבנה".' },
];
function tabTemplates(host) {
  host.replaceChildren(el('p', { class: 'admin-note', text: 'קבצים מוכנים להורדה. תוכן הדוגמה מדומה בלבד. עורכים, ומעלים בלשונית המתאימה, שם הם נבדקים לפני פרסום.' }),
    ...TEMPLATES.map((t) => {
      const pre = el('pre', { class: 'admin-pre', hidden: true, tabindex: '0', 'aria-label': `תוכן ${t.title}` });
      const href = new URL(`../../templates/${t.file}`, import.meta.url).href;
      const show = button('הצגה', () => guarded(async () => {
        if (pre.hidden) {
          const res = await fetch(href, { cache: 'no-cache' });
          if (!res.ok) throw new Error('לא הצלחנו לטעון את התבנית');
          pre.textContent = await res.text();
        }
        pre.hidden = !pre.hidden;
      }, pre), { class: 'secondary' });
      const copy = button('העתקה', () => guarded(async () => {
        const res = await fetch(href, { cache: 'no-cache' });
        await navigator.clipboard.writeText(await res.text());
        say('הועתק ללוח.');
      }, pre), { class: 'secondary' });
      return el('section', { class: 'admin-card' },
        el('h2', { text: t.title }), el('p', { text: t.note }),
        el('div', { class: 'admin-row' }, el('a', { class: 'button', href, download: t.file, text: 'הורדה' }), show, copy), pre);
    }));
}

const TABS = [
  { id: 'overview', label: 'סקירה', render: tabOverview },
  { id: 'structure', label: 'מבנה', render: tabStructure },
  { id: 'quizzes', label: 'מבחנים', render: tabQuizzes },
  { id: 'summaries', label: 'סיכומים', render: tabSummaries },
  { id: 'templates', label: 'תבניות', render: tabTemplates },
];

function renderPanel(active = 'overview') {
  activeTab = active;
  titleEl.textContent = 'ניהול האתר';
  const host = el('div');
  const nav = el('ul', { class: 'admin-tabs' }, TABS.map((t) => el('li', {},
    button(t.label, () => renderPanel(t.id), t.id === active ? { 'aria-current': 'page' } : {}))));
  root.replaceChildren(
    el('div', { class: 'admin-row' },
      el('span', { class: 'admin-note', text: `מחובר ל‑${session.repo.owner}/${session.repo.name} (${session.repo.branch})` }),
      button('נעילה', () => lock(), { class: 'secondary' })),
    el('nav', { 'aria-label': 'אזורי ניהול' }, nav), pendingBanner, host);
  if (pendingBanner) { say(''); pendingBanner.focus(); pendingBanner = null; }
  guarded(() => TABS.find((t) => t.id === active).render(host), host);
}

// ---------- boot ----------
function boot() {
  if (window.top !== window.self) {
    // Clickjacking guard: the panel never runs inside a frame.
    root.replaceChildren(el('p', { text: 'הפאנל אינו נטען בתוך מסגרת.' }));
    return;
  }
  const vault = load(VAULT_KEY);
  if (!vault?.sealed || !vault?.repo) return renderSetup();
  renderUnlock(vault);
}
boot();
