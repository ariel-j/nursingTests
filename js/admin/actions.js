// Turns a panel action into the exact files to commit. Pure: the caller supplies the current repo
// state (catalog, quizzes, summaries list, css) and gets { files, errors }. When `errors` is not
// empty, nothing may be committed. Uses the same validators as `npm run validate`.
import { validateQuiz } from '../core.js';
import { buildManifest, placementErrors, serializeManifest, validateCatalog } from '../catalog.js';
import { fromAuthoringFormat } from '../import-format.js';
import { listErrors } from '../summary-list.js';
import { pageErrors } from '../summary-check.js';
import { isValidId, quizPath, summaryPath, withSummaryAccent } from './uploads.js';

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

/** Replace the catalog (subjects and units). Refuses a catalog that would orphan an existing quiz. */
export function planCatalog({ catalog, quizzes }) {
  const errors = validateCatalog(catalog);
  if (errors.length === 0) {
    for (const q of quizzes) errors.push(...placementErrors(q, catalog).map((e) => `${q.id}: ${e}`));
  }
  if (errors.length > 0) return { files: [], errors };
  return {
    errors: [],
    files: [
      { path: 'quizzes/subjects.json', text: json(catalog) },
      { path: 'quizzes/manifest.json', text: serializeManifest(buildManifest(quizzes, catalog)) },
    ],
    summary: 'עדכון נושאים ותתי־נושאים',
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
