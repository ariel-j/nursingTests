// Turns a panel action into the exact files to commit. Pure: the caller supplies the current repo
// state (catalog, quizzes, summaries list, css) and gets { files, errors }. When `errors` is not
// empty, nothing may be committed. Uses the same validators as `npm run validate`.
import { validateQuiz } from '../core.js';
import { validateDeck } from '../cards-core.js';
import { captionsFile, formatDuration, readMp4Duration, validateVideo, videoFile, vttErrors } from '../video-core.js';
import { buildManifest, placementErrors, serializeManifest, validateCatalog } from '../catalog.js';
import { fromAuthoringFormat } from '../import-format.js';
import { listErrors } from '../summary-list.js';
import { pageErrors } from '../summary-check.js';
import { captionsPath, checkVideo, deckPath, isValidId, quizPath, setSummaryAccent, videoMediaPath, videoMetaPath, summaryPath, withSummaryAccent, withoutSummaryAccent } from './uploads.js';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * The manifest file for the whole site. EVERY plan that changes quizzes, decks or the catalog builds its
 * manifest through this one helper, so no action can regenerate a manifest that forgets the decks.
 */
export const manifestFile = ({ quizzes = [], decks = [], videos = [] }, catalog) => ({
  path: 'quizzes/manifest.json',
  text: serializeManifest(buildManifest(quizzes, catalog, decks, videos)),
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

/** Reads every video's metadata at the current head (the media files themselves are never downloaded). */
export const readVideos = (api) => readFolder(api, 'videos');

// What differs between the two kinds of item that live in a subject/unit.
const KINDS = {
  quiz: { noun: 'מבחן', validate: validateQuiz, pathOf: quizPath, size: (x) => `${x.questions.length} שאלות` },
  deck: { noun: 'חפיסה', validate: validateDeck, pathOf: deckPath, size: (x) => `${x.cards.length} כרטיסיות` },
  video: { noun: 'סרטון', validate: validateVideo, pathOf: videoMetaPath, size: (x) => formatDuration(x.durationSec) || 'סרטון' },
};

const STATE_KEY = { quiz: 'quizzes', deck: 'decks', video: 'videos' };
// The manifest for `items` of `kind`, with the other kinds left as they are.
const manifestFor = (kind, items, state) => manifestFile({ ...state, [STATE_KEY[kind]]: items }, state.catalog);
const itemsOf = (kind, state) => state[STATE_KEY[kind]];
// Every plan works on the whole site: callers that have no decks or videos simply pass none.
const withState = (args) => ({ quizzes: [], decks: [], videos: [], ...args });

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
export const planQuiz = (args) => addItem('quiz', withState(args));
export const planQuizDelete = (args) => deleteItem('quiz', withState(args));
/** Edit a quiz's details or move it. The id is immutable: saved progress in browsers is keyed by it. */
export const planQuizEdit = (args) => editItem('quiz', withState(args));

/** Flashcard decks: same flow as quizzes, JSON in the site format only. */
export const planDeck = (args) => addItem('deck', withState(args));
export const planDeckDelete = (args) => deleteItem('deck', withState(args));
export const planDeckEdit = (args) => editItem('deck', withState(args));

/** Edit a video's details or move it (its files are untouched; use planVideo with replace to change the media). */
export const planVideoEdit = (args) => editItem('video', withState(args));

/**
 * Replace the catalog. `renames` = { subjects: { old: new }, units: { [oldSubjectName]: { old: new } } }
 * makes a rename cascade into every affected quiz and deck (and the manifest) in the same commit. A
 * subject or unit that is removed while it still holds quizzes or decks is refused, and they are listed.
 */
export function planStructure({ catalog, renames = {}, quizzes = [], decks = [], videos = [] }) {
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
  const v = move(videos);
  for (const x of [...q.updated, ...d.updated, ...v.updated]) {
    for (const e of placementErrors(x, catalog)) errors.push(`"${x.title}" (${x.id}): ${e}`);
  }
  if (errors.length > 0) return { files: [], errors };

  const parts = [];
  if (q.changed.length > 0) parts.push(`${q.changed.length} מבחנים`);
  if (d.changed.length > 0) parts.push(`${d.changed.length} חפיסות`);
  if (v.changed.length > 0) parts.push(`${v.changed.length} סרטונים`);
  return {
    errors: [],
    files: [
      { path: 'quizzes/subjects.json', text: json(catalog) },
      ...q.changed.map((x) => ({ path: quizPath(x.id), text: json(x) })),
      ...d.changed.map((x) => ({ path: deckPath(x.id), text: json(x) })),
      ...v.changed.map((x) => ({ path: videoMetaPath(x.id), text: json(x) })),
      manifestFile({ quizzes: q.updated, decks: d.updated, videos: v.updated }, catalog),
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

const MB = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

/**
 * Add or replace a video: its metadata, the mp4 (raw bytes) and optional captions (WebVTT text), plus the
 * manifest, in one plan. The duration is read from the mp4 header. Replacing keeps existing captions unless
 * new ones are given. `meta` = { id, subject, unit?, title, description? }.
 */
export function planVideo({ meta, mp4, vtt = null, replace = false, catalog, ...rest }) {
  const state = withState({ catalog, ...rest });
  const errors = [];
  const id = meta?.id;
  if (!isValidId(id)) errors.push('מזהה לא תקין (אותיות קטנות באנגלית, ספרות ומקפים)');
  if (!(mp4 instanceof Uint8Array)) errors.push('לא נבחר קובץ סרטון');
  else if (isValidId(id)) errors.push(...checkVideo({ name: videoFile(id), size: mp4.length, bytes: mp4 }));
  if (vtt !== null) errors.push(...vttErrors(vtt).map((e) => `כתוביות: ${e}`));
  if (errors.length > 0) return { files: [], errors };

  const existing = state.videos.find((x) => x.id === id);
  const duration = readMp4Duration(mp4);
  const video = {
    id,
    subject: meta.subject,
    ...(meta.unit ? { unit: meta.unit } : {}),
    title: (meta.title ?? '').trim(),
    ...(meta.description?.trim() ? { description: meta.description.trim() } : {}),
    file: videoFile(id),
    ...(vtt !== null || (replace && existing?.captions) ? { captions: captionsFile(id) } : {}),
    ...(duration === null ? {} : { durationSec: duration }),
  };
  errors.push(...validateVideo(video));
  if (errors.length === 0) errors.push(...placementErrors(video, catalog));
  if (errors.length === 0 && existing && !replace) errors.push(`סרטון עם המזהה "${id}" כבר קיים (סמנו "החלפה" כדי לדרוס)`);
  if (errors.length > 0) return { files: [], errors };

  const files = [{ path: videoMediaPath(id), bytes: mp4 }, { path: videoMetaPath(id), text: json(video) }];
  if (vtt !== null) files.push({ path: captionsPath(id), text: vtt });
  files.push(manifestFor('video', [...state.videos.filter((x) => x.id !== id), video], state));
  return {
    errors: [],
    files,
    summary: `סרטון "${video.title}" (${[formatDuration(duration), MB(mp4.length), vtt !== null ? 'עם כתוביות' : null].filter(Boolean).join(', ')})`,
  };
}

/** Delete a video: the metadata, the mp4 and its captions, together (git history keeps the old bytes). */
export function planVideoDelete({ id, catalog, ...rest }) {
  const state = withState({ catalog, ...rest });
  const existing = state.videos.find((x) => x.id === id);
  if (!isValidId(id) || !existing) return { files: [], errors: ['הסרטון לא נמצא'] };
  return {
    errors: [],
    deletes: [videoMetaPath(id), videoMediaPath(id), ...(existing.captions ? [captionsPath(id)] : [])],
    files: [manifestFor('video', state.videos.filter((x) => x.id !== id), state)],
    summary: `מחיקת סרטון "${id}"`,
  };
}

/** Set, replace (`vtt` = text) or remove (`vtt` = null) a video's captions. */
export function planVideoCaptions({ id, vtt, catalog, ...rest }) {
  const state = withState({ catalog, ...rest });
  const existing = state.videos.find((x) => x.id === id);
  if (!isValidId(id) || !existing) return { files: [], errors: ['הסרטון לא נמצא'] };

  let next;
  const files = [];
  const deletes = [];
  if (vtt === null) {
    if (!existing.captions) return { files: [], errors: ['לסרטון הזה אין כתוביות'] };
    const { captions, ...without } = existing;
    void captions;
    next = without;
    deletes.push(captionsPath(id));
  } else {
    const errors = vttErrors(vtt).map((e) => `כתוביות: ${e}`);
    if (errors.length > 0) return { files: [], errors };
    next = { ...existing, captions: captionsFile(id) };
    files.push({ path: captionsPath(id), text: vtt });
  }
  files.push({ path: videoMetaPath(id), text: json(next) });
  files.push(manifestFor('video', state.videos.map((x) => (x.id === id ? next : x)), state));
  return {
    errors: [],
    files,
    ...(deletes.length > 0 ? { deletes } : {}),
    summary: vtt === null ? `הסרת כתוביות מ"${existing.title}"` : `כתוביות ל"${existing.title}"`,
  };
}
