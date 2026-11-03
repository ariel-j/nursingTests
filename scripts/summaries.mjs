// Checks for the short summaries (summaries/*.html), used by validate and the tests.
// The pages are hand-written HTML, so this guards the site rules they must keep.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUMMARIES, summaryFile } from '../js/summary-list.js';
import { loadCatalog, loadQuizzes } from './quizzes.mjs';

export const SUMMARY_DIR = fileURLToPath(new URL('../summaries/', import.meta.url));
export const SUMMARY_CSS = fileURLToPath(new URL('../css/summary.css', import.meta.url));
// Pages in summaries/ that are not summaries themselves.
const SUPPORT_PAGES = new Set(['index.html', 'all.html']);

/**
 * Problems with one page's HTML. `isSummary` adds the checks for a summary's content page;
 * `quiz` (a lab's warm-up quiz id) adds the checks for an interactive summary.
 */
export function pageErrors(html, { id, isSummary, quiz }) {
  const errors = [];
  if (/\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(html) || /url\(\s*["']?(?:https?:)?\/\//i.test(html)) {
    errors.push('loads an external resource (fonts and assets must be self-hosted)');
  }
  if (/<[^>]+\s(?:on[a-z]+|style)\s*=/i.test(html)) errors.push('inline style or event handler attribute');
  if (!html.includes('src="../js/a11y.js"')) errors.push('missing the accessibility toolbar (../js/a11y.js)');
  for (const page of ['../accessibility.html', '../privacy.html']) {
    if (!html.includes(`href="${page}"`)) errors.push(`footer is missing the link to ${page}`);
  }
  if (isSummary) {
    const articles = html.match(/<article class="summary"[^>]*>/g) ?? [];
    const expected = `<article class="summary" data-system="${id}"${quiz ? ` data-quiz="${quiz}"` : ''}>`;
    if (articles.length !== 1 || articles[0] !== expected) errors.push(`needs exactly one ${expected}`);
    if (!html.includes('data-print')) errors.push('missing the print / PDF button');
    if (quiz) {
      if (!html.includes('src="../js/lab.js"')) errors.push('missing the interactive layer (../js/lab.js)');
      if (!html.includes(`href="../quiz.html?id=${quiz}"`)) errors.push(`missing the link to the full quiz "${quiz}"`);
      if (!html.includes(`<section class="lab-quiz no-print" data-quiz="${quiz}" hidden>`)) errors.push('missing the warm-up quiz section');
    } else if (html.includes('js/lab.js')) {
      errors.push('loads js/lab.js but the list entry has no "quiz"');
    }
  }
  return errors;
}

/**
 * Problems with one list entry's placement: its subject, unit and warm-up quiz must exist in the
 * catalog and the quizzes. `quizzes` is [{ id, subject, unit }].
 */
export function entryErrors(entry, catalog, quizzes) {
  const errors = [];
  const subject = catalog.subjects.find((s) => s.name === entry.subject);
  if (!subject) return [`subject "${entry.subject}" is not in the catalog`];
  if (entry.unit !== undefined && !(subject.units ?? []).includes(entry.unit)) {
    errors.push(`unit "${entry.unit}" is not listed under "${entry.subject}" in the catalog`);
  }
  if (entry.quiz !== undefined) {
    const quiz = quizzes.find((q) => q.id === entry.quiz);
    if (!quiz) errors.push(`quiz "${entry.quiz}" does not exist`);
    else if (quiz.subject !== entry.subject || quiz.unit !== entry.unit) {
      errors.push(`quiz "${entry.quiz}" belongs to "${quiz.subject} / ${quiz.unit}", not to this entry's subject and unit`);
    }
  }
  return errors;
}

/** Every problem across the summaries: the list, the pages and the stylesheet's accents. */
export async function checkSummaries(dir = SUMMARY_DIR, cssFile = SUMMARY_CSS) {
  const errors = [];
  const ids = SUMMARIES.map((s) => s.id);
  const { catalog } = await loadCatalog();
  const quizzes = catalog
    ? (await loadQuizzes()).filter((e) => e.quiz).map((e) => ({ id: e.quiz.id, subject: e.quiz.subject, unit: e.quiz.unit }))
    : [];
  if (new Set(ids).size !== ids.length) errors.push('js/summary-list.js: duplicate id');
  for (const s of SUMMARIES) {
    if (!/^[a-z0-9-]+$/.test(s.id)) errors.push(`js/summary-list.js: bad id "${s.id}"`);
    if (!s.title || !s.blurb) errors.push(`js/summary-list.js: ${s.id} needs a title and a blurb`);
    if (catalog) for (const e of entryErrors(s, catalog, quizzes)) errors.push(`js/summary-list.js: ${s.id}: ${e}`);
  }

  const files = (await readdir(dir)).filter((f) => f.endsWith('.html'));
  const listed = new Set(ids.map(summaryFile));
  for (const file of files) {
    if (!SUPPORT_PAGES.has(file) && !listed.has(file)) {
      errors.push(`summaries/${file}: not listed in js/summary-list.js`);
    }
  }
  for (const file of [...SUPPORT_PAGES, ...listed]) {
    if (!files.includes(file)) {
      errors.push(`summaries/${file}: missing`);
      continue;
    }
    const html = await readFile(path.join(dir, file), 'utf8');
    const id = file.replace(/\.html$/, '');
    const quiz = SUMMARIES.find((x) => x.id === id)?.quiz;
    for (const e of pageErrors(html, { id, isSummary: listed.has(file), quiz })) errors.push(`summaries/${file}: ${e}`);
  }

  const css = await readFile(cssFile, 'utf8');
  for (const id of ids) {
    if (!css.includes(`[data-system="${id}"]`)) errors.push(`css/summary.css: no accent colors for "${id}"`);
  }
  return errors;
}
