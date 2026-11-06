// Turns a panel action into the exact files to commit. Pure: the caller supplies the current repo
// state (catalog, quizzes, summaries list, css) and gets { files, errors }. When `errors` is not
// empty, nothing may be committed. Uses the same validators as `npm run validate`.
import { validateQuiz } from '../core.js';
import { buildManifest, placementErrors, serializeManifest, validateCatalog } from '../catalog.js';
import { fromAuthoringFormat } from '../import-format.js';
import { listErrors } from '../summary-list.js';
import { pageErrors } from '../summary-check.js';
import { isValidId, quizPath, setSummaryAccent, summaryPath, withSummaryAccent, withoutSummaryAccent } from './uploads.js';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** Tells a site-format quiz from an authoring-format one (options as strings + correctIndex). */
export function detectQuizFormat(source) {
  const first = source?.questions?.[0];
  if (first && 'correctIndex' in first) return 'authoring';
  return 'site';
}

/** Reads every quiz file at the current head. `listFiles`/`readText` come from the GitHub client. */
export async function readQuizzes({ listFiles, readText }) {
  const paths = (await listFiles()).filter(
    (p) => /^quizzes\/[^/]+\.json$/.test(p) && !/^quizzes\/(?:subjects|manifest)\.json$/.test(p),
  );
  return Promise.all(paths.map(async (p) => JSON.parse(await readText(p))));
}

/**
 * Add or replace a quiz. `source` is the parsed upload; `overrides` are fields chosen in the form
 * (id, subject, unit, title, description). Replacing an existing id requires `replace: true`.
 */
export function planQuiz({ source, overrides = {}, catalog, quizzes, replace = false }) {
  let quiz;
  try {
    quiz = detectQuizFormat(source) === 'authoring' ? fromAuthoringFormat(source, overrides) : { ...source };
    for (const [k, v] of Object.entries(overrides)) if (v !== undefined && v !== '') quiz[k] = v;
  } catch (err) {
    return { files: [], errors: [err.message] };
  }
  const errors = validateQuiz(quiz);
  if (errors.length === 0 && !isValidId(quiz.id)) errors.push('id לא תקין');
  if (errors.length === 0) errors.push(...placementErrors(quiz, catalog));
  if (errors.length === 0 && !replace && quizzes.some((q) => q.id === quiz.id)) {
    errors.push(`מבחן עם המזהה "${quiz.id}" כבר קיים (סמנו "החלפה" כדי לדרוס)`);
  }
  if (errors.length > 0) return { files: [], errors };

  const all = [...quizzes.filter((q) => q.id !== quiz.id), quiz];
  return {
    errors: [],
    files: [
      { path: quizPath(quiz.id), text: json(quiz) },
      { path: 'quizzes/manifest.json', text: serializeManifest(buildManifest(all, catalog)) },
    ],
    summary: `מבחן "${quiz.title}" (${quiz.questions.length} שאלות)`,
  };
}

/** Delete a quiz and refresh the manifest. */
export function planQuizDelete({ id, catalog, quizzes }) {
  if (!isValidId(id) || !quizzes.some((q) => q.id === id)) return { files: [], errors: ['המבחן לא נמצא'] };
  const rest = quizzes.filter((q) => q.id !== id);
  return {
    errors: [],
    deletes: [quizPath(id)],
    files: [{ path: 'quizzes/manifest.json', text: serializeManifest(buildManifest(rest, catalog)) }],
    summary: `מחיקת מבחן "${id}"`,
  };
}

/**
 * Replace the catalog. `renames` = { subjects: { old: new }, units: { [oldSubjectName]: { old: new } } }
 * makes a rename cascade into every affected quiz (and the manifest) in the same commit. A subject or
 * unit that is removed while it still holds quizzes is refused, and the quizzes are listed.
 */
export function planStructure({ catalog, renames = {}, quizzes }) {
  const errors = validateCatalog(catalog);
  if (errors.length > 0) return { files: [], errors };

  const changed = [];
  const updated = quizzes.map((q) => {
    const subject = renames.subjects?.[q.subject] ?? q.subject;
    const unit = q.unit === undefined ? undefined : (renames.units?.[q.subject]?.[q.unit] ?? q.unit);
    if (subject === q.subject && unit === q.unit) return q;
    const next = { ...q, subject };
    if (unit !== undefined) next.unit = unit;
    changed.push(next);
    return next;
  });
  for (const q of updated) {
    for (const e of placementErrors(q, catalog)) errors.push(`"${q.title}" (${q.id}): ${e}`);
  }
  if (errors.length > 0) return { files: [], errors };

  return {
    errors: [],
    files: [
      { path: 'quizzes/subjects.json', text: json(catalog) },
      ...changed.map((q) => ({ path: quizPath(q.id), text: json(q) })),
      { path: 'quizzes/manifest.json', text: serializeManifest(buildManifest(updated, catalog)) },
    ],
    summary: changed.length > 0 ? `עדכון נושאים (שינוי שם משפיע על ${changed.length} מבחנים)` : 'עדכון נושאים ותתי־נושאים',
  };
}

const QUIZ_EDITABLE = new Set(['title', 'description', 'subject', 'unit']);

/** Edit a quiz's details or move it. The id is immutable: saved progress in browsers is keyed by it. */
export function planQuizEdit({ id, patch, catalog, quizzes }) {
  const current = quizzes.find((q) => q.id === id);
  if (!isValidId(id) || !current) return { files: [], errors: ['המבחן לא נמצא'] };
  const unknown = Object.keys(patch).filter((k) => !QUIZ_EDITABLE.has(k));
  if (unknown.length > 0) return { files: [], errors: [`לא ניתן לשנות: ${unknown.join(', ')} (המזהה קבוע)`] };

  const next = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '' || v === null) delete next[k];
    else next[k] = typeof v === 'string' ? v.trim() : v;
  }
  if (JSON.stringify(next) === JSON.stringify(current)) return { files: [], errors: ['לא בוצע שינוי'] };
  const errors = validateQuiz(next);
  if (errors.length === 0) errors.push(...placementErrors(next, catalog));
  if (errors.length > 0) return { files: [], errors };

  const all = quizzes.map((q) => (q.id === id ? next : q));
  return {
    errors: [],
    files: [
      { path: quizPath(id), text: json(next) },
      { path: 'quizzes/manifest.json', text: serializeManifest(buildManifest(all, catalog)) },
    ],
    summary: `עריכת מבחן "${next.title}"`,
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
