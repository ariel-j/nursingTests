// Turns a panel action into the exact files to commit. Pure: the caller supplies the current repo
// state (catalog, quizzes, summaries list, css) and gets { files, errors }. When `errors` is not
// empty, nothing may be committed. Uses the same validators as `npm run validate`.
import { validateQuiz } from '../core.js';
import { validateDeck } from '../cards-core.js';
import { buildManifest, placementErrors, serializeManifest, validateCatalog } from '../catalog.js';
import { fromAuthoringFormat } from '../import-format.js';
import { listErrors } from '../summary-list.js';
import { pageErrors } from '../summary-check.js';
import { deckPath, isValidId, quizPath, setSummaryAccent, summaryPath, withSummaryAccent, withoutSummaryAccent } from './uploads.js';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * The manifest file for the whole site. EVERY plan that changes quizzes, decks or the catalog builds its
 * manifest through this one helper, so no action can regenerate a manifest that forgets the decks.
 */
export const manifestFile = (quizzes, decks, catalog) => ({
  path: 'quizzes/manifest.json',
  text: serializeManifest(buildManifest(quizzes, catalog, decks)),
});

/** Tells a site-format quiz from an authoring-format one (options as strings + correctIndex). */
export function detectQuizFormat(source) {
  const first = source?.questions?.[0];
  if (first && 'correctIndex' in first) return 'authoring';
  return 'site';
}

async function readFolder({ listFiles, readText }, folder, skip = () => false) {
  const re = new RegExp(`^${folder}/[^/]+\\.json$`);
  const paths = (await listFiles()).filter((p) => re.test(p) && !skip(p));
  return Promise.all(paths.map(async (p) => JSON.parse(await readText(p))));
}

/** Reads every quiz file at the current head. `listFiles`/`readText` come from the GitHub client. */
export const readQuizzes = (api) => readFolder(api, 'quizzes', (p) => /^quizzes\/(?:subjects|manifest)\.json$/.test(p));

/** Reads every flashcard deck at the current head (none when the folder does not exist yet). */
export const readDecks = (api) => readFolder(api, 'flashcards');

// What differs between the two kinds of item that live in a subject/unit.
const KINDS = {
  quiz: { noun: 'מבחן', validate: validateQuiz, pathOf: quizPath, size: (x) => `${x.questions.length} שאלות` },
  deck: { noun: 'חפיסה', validate: validateDeck, pathOf: deckPath, size: (x) => `${x.cards.length} כרטיסיות` },
};

// The manifest for `items` of `kind` with the other kind left as it is.
const manifestFor = (kind, items, { quizzes, decks, catalog }) =>
  kind === 'quiz' ? manifestFile(items, decks, catalog) : manifestFile(quizzes, items, catalog);
const itemsOf = (kind, { quizzes, decks }) => (kind === 'quiz' ? quizzes : decks);

function addItem(kind, { source, overrides = {}, replace = false, ...state }) {
  const k = KINDS[kind];
  let item;
  try {
    item = kind === 'quiz' && detectQuizFormat(source) === 'authoring'
      ? fromAuthoringFormat(source, overrides)
      : { ...source };
    for (const [key, v] of Object.entries(overrides)) if (v !== undefined && v !== '') item[key] = v;
  } catch (err) {
    return { files: [], errors: [err.message] };
  }
  const errors = k.validate(item);
  if (errors.length === 0 && !isValidId(item.id)) errors.push('id לא תקין');
  if (errors.length === 0) errors.push(...placementErrors(item, state.catalog));
  const items = itemsOf(kind, state);
  if (errors.length === 0 && !replace && items.some((x) => x.id === item.id)) {
    errors.push(`${k.noun} עם המזהה "${item.id}" כבר קיים (סמנו "החלפה" כדי לדרוס)`);
  }
  if (errors.length > 0) return { files: [], errors };

  const all = [...items.filter((x) => x.id !== item.id), item];
  return {
    errors: [],
    files: [{ path: k.pathOf(item.id), text: json(item) }, manifestFor(kind, all, state)],
    summary: `${k.noun} "${item.title}" (${k.size(item)})`,
  };
}

function deleteItem(kind, { id, ...state }) {
  const k = KINDS[kind];
  const items = itemsOf(kind, state);
  if (!isValidId(id) || !items.some((x) => x.id === id)) return { files: [], errors: [`ה${k.noun} לא נמצא`] };
  return {
    errors: [],
    deletes: [k.pathOf(id)],
    files: [manifestFor(kind, items.filter((x) => x.id !== id), state)],
    summary: `מחיקת ${k.noun} "${id}"`,
  };
}

const EDITABLE = new Set(['title', 'description', 'subject', 'unit']);

function editItem(kind, { id, patch, ...state }) {
  const k = KINDS[kind];
  const items = itemsOf(kind, state);
  const current = items.find((x) => x.id === id);
  if (!isValidId(id) || !current) return { files: [], errors: [`ה${k.noun} לא נמצא`] };
  const unknown = Object.keys(patch).filter((key) => !EDITABLE.has(key));
  if (unknown.length > 0) return { files: [], errors: [`לא ניתן לשנות: ${unknown.join(', ')} (המזהה קבוע)`] };

  const next = { ...current };
  for (const [key, v] of Object.entries(patch)) {
    if (v === undefined || v === '' || v === null) delete next[key];
    else next[key] = typeof v === 'string' ? v.trim() : v;
  }
  if (JSON.stringify(next) === JSON.stringify(current)) return { files: [], errors: ['לא בוצע שינוי'] };
  const errors = k.validate(next);
  if (errors.length === 0) errors.push(...placementErrors(next, state.catalog));
  if (errors.length > 0) return { files: [], errors };

  return {
    errors: [],
    files: [
      { path: k.pathOf(id), text: json(next) },
      manifestFor(kind, items.map((x) => (x.id === id ? next : x)), state),
    ],
    summary: `עריכת ${k.noun} "${next.title}"`,
  };
}

/**
 * Add or replace a quiz. `source` is the parsed upload; `overrides` are fields chosen in the form
 * (id, subject, unit, title, description). Replacing an existing id requires `replace: true`.
 */
export const planQuiz = ({ decks = [], ...args }) => addItem('quiz', { decks, ...args });
export const planQuizDelete = ({ decks = [], ...args }) => deleteItem('quiz', { decks, ...args });
/** Edit a quiz's details or move it. The id is immutable: saved progress in browsers is keyed by it. */
export const planQuizEdit = ({ decks = [], ...args }) => editItem('quiz', { decks, ...args });

/** Flashcard decks: same flow as quizzes, JSON in the site format only. */
export const planDeck = ({ quizzes = [], ...args }) => addItem('deck', { quizzes, ...args });
export const planDeckDelete = ({ quizzes = [], ...args }) => deleteItem('deck', { quizzes, ...args });
export const planDeckEdit = ({ quizzes = [], ...args }) => editItem('deck', { quizzes, ...args });

/**
 * Replace the catalog. `renames` = { subjects: { old: new }, units: { [oldSubjectName]: { old: new } } }
 * makes a rename cascade into every affected quiz and deck (and the manifest) in the same commit. A
 * subject or unit that is removed while it still holds quizzes or decks is refused, and they are listed.
 */
export function planStructure({ catalog, renames = {}, quizzes, decks = [] }) {
  const errors = validateCatalog(catalog);
  if (errors.length > 0) return { files: [], errors };

  const move = (items) => {
    const changed = [];
    const updated = items.map((x) => {
      const subject = renames.subjects?.[x.subject] ?? x.subject;
      const unit = x.unit === undefined ? undefined : (renames.units?.[x.subject]?.[x.unit] ?? x.unit);
      if (subject === x.subject && unit === x.unit) return x;
      const next = { ...x, subject };
      if (unit !== undefined) next.unit = unit;
      changed.push(next);
      return next;
    });
    return { updated, changed };
  };
  const q = move(quizzes);
  const d = move(decks);
  for (const x of [...q.updated, ...d.updated]) {
    for (const e of placementErrors(x, catalog)) errors.push(`"${x.title}" (${x.id}): ${e}`);
  }
  if (errors.length > 0) return { files: [], errors };

  const parts = [];
  if (q.changed.length > 0) parts.push(`${q.changed.length} מבחנים`);
  if (d.changed.length > 0) parts.push(`${d.changed.length} חפיסות`);
  return {
    errors: [],
    files: [
      { path: 'quizzes/subjects.json', text: json(catalog) },
      ...q.changed.map((x) => ({ path: quizPath(x.id), text: json(x) })),
      ...d.changed.map((x) => ({ path: deckPath(x.id), text: json(x) })),
      manifestFile(q.updated, d.updated, catalog),
    ],
    summary: parts.length > 0 ? `עדכון נושאים (שינוי שם משפיע על ${parts.join(' ו')})` : 'עדכון נושאים ותתי־נושאים',
  };
}

/** Points the article's data-system at the chosen id (a validated id only), so templates need no hand-editing. */
export function withSummaryId(html, id) {
  if (!isValidId(id)) return html;
  return html.replace(/<article class="summary" data-system="[^"]*">/, `<article class="summary" data-system="${id}">`);
}

/** Add or replace a summary page: the HTML, its list entry and its accent color, together. */
export function planSummary({ html, id, title, blurb, hue, list, css, replace = false }) {
  html = withSummaryId(html, id);
  const errors = [];
  if (!isValidId(id)) errors.push('מזהה לא תקין (אותיות קטנות באנגלית, ספרות ומקפים)');
  if (!title?.trim() || !blurb?.trim()) errors.push('נדרשים כותרת ותיאור קצר');
  if (errors.length === 0) errors.push(...pageErrors(html, { id, isSummary: true }));
  const exists = list.summaries.some((s) => s.id === id);
  if (errors.length === 0 && exists && !replace) errors.push(`סיכום "${id}" כבר קיים (סמנו "החלפה" כדי לדרוס)`);
  if (errors.length > 0) return { files: [], errors };

  const entry = { id, title: title.trim(), blurb: blurb.trim() };
  const next = {
    summaries: exists ? list.summaries.map((s) => (s.id === id ? entry : s)) : [...list.summaries, entry],
  };
  const listProblems = listErrors(next);
  if (listProblems.length > 0) return { files: [], errors: listProblems };

  const files = [
    { path: summaryPath(id), text: html },
    { path: 'summaries/list.json', text: json(next) },
  ];
  const nextCss = withSummaryAccent(css, id, hue);
  if (nextCss !== css) files.push({ path: 'css/summary.css', text: nextCss });
  return { errors: [], files, summary: `סיכום "${entry.title}"` };
}

/** Delete a summary: its page, its list entry and its accent line, together. */
export function planSummaryDelete({ id, list, css }) {
  if (!isValidId(id) || !list.summaries.some((s) => s.id === id)) return { files: [], errors: ['הסיכום לא נמצא'] };
  const next = { summaries: list.summaries.filter((s) => s.id !== id) };
  const files = [{ path: 'summaries/list.json', text: json(next) }];
  const nextCss = withoutSummaryAccent(css, id);
  if (nextCss !== css) files.push({ path: 'css/summary.css', text: nextCss });
  return { errors: [], files, deletes: [summaryPath(id)], summary: `מחיקת סיכום "${id}"` };
}

/** Edit a summary's title, blurb and (optionally) accent hue. Its page content is changed by re-upload. */
export function planSummaryEdit({ id, title, blurb, hue, list, css }) {
  const current = list.summaries.find((s) => s.id === id);
  if (!isValidId(id) || !current) return { files: [], errors: ['הסיכום לא נמצא'] };
  if (!title?.trim() || !blurb?.trim()) return { files: [], errors: ['נדרשים כותרת ותיאור קצר'] };
  const entry = { ...current, title: title.trim(), blurb: blurb.trim() };
  const next = { summaries: list.summaries.map((s) => (s.id === id ? entry : s)) };
  const errors = listErrors(next);
  if (errors.length > 0) return { files: [], errors };

  const files = [];
  if (JSON.stringify(entry) !== JSON.stringify(current)) files.push({ path: 'summaries/list.json', text: json(next) });
  if (hue !== undefined && hue !== null && hue !== '') {
    const nextCss = setSummaryAccent(css, id, hue);
    if (nextCss !== css) files.push({ path: 'css/summary.css', text: nextCss });
  }
  if (files.length === 0) return { files: [], errors: ['לא בוצע שינוי'] };
  return { errors: [], files, summary: `עריכת סיכום "${entry.title}"` };
}

/** Reorder the summaries (the order of the hub and of the combined PDF). `order` is a list of ids. */
export function planSummaryOrder({ order, list }) {
  const ids = list.summaries.map((s) => s.id);
  const same = Array.isArray(order) && order.length === ids.length && new Set(order).size === ids.length && order.every((i) => ids.includes(i));
  if (!same) return { files: [], errors: ['הסדר חייב לכלול כל סיכום קיים בדיוק פעם אחת'] };
  if (order.every((id, i) => id === ids[i])) return { files: [], errors: ['לא בוצע שינוי'] };
  const next = { summaries: order.map((id) => list.summaries.find((s) => s.id === id)) };
  return { errors: [], files: [{ path: 'summaries/list.json', text: json(next) }], summary: 'שינוי סדר הסיכומים' };
}
