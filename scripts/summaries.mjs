// Checks for the short summaries (summaries/*.html), used by validate and the tests.
// The pages are hand-written HTML, so this guards the site rules they must keep.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUMMARIES, summaryFile } from '../js/summary-list.js';

export const SUMMARY_DIR = fileURLToPath(new URL('../summaries/', import.meta.url));
export const SUMMARY_CSS = fileURLToPath(new URL('../css/summary.css', import.meta.url));
// Pages in summaries/ that are not summaries themselves.
const SUPPORT_PAGES = new Set(['index.html', 'all.html']);

// Site pages outside summaries/, checked with the same rules (paths relative to the root).
export const ROOT_DIR = fileURLToPath(new URL('../', import.meta.url));
export const ROOT_PAGES = ['index.html', 'quiz.html', 'print.html', 'accessibility.html', 'privacy.html'];

/**
 * Problems with one page's HTML. `root` is the path from the page to the site root ('../' for
 * summaries/, '' for the root pages). `isSummary` adds the checks for a summary's content page.
 */
export function pageErrors(html, { id, isSummary, root = '../' }) {
  const errors = [];
  if (/\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(html) || /url\(\s*["']?(?:https?:)?\/\//i.test(html)) {
    errors.push('loads an external resource (fonts and assets must be self-hosted)');
  }
  if (/<[^>]+\s(?:on[a-z]+|style)\s*=/i.test(html)) errors.push('inline style or event handler attribute');
  if (!html.includes(`src="${root}js/a11y.js"`)) errors.push(`missing the accessibility toolbar (${root}js/a11y.js)`);
  if (!html.includes(`src="${root}js/nav.js"`)) errors.push(`missing the side menu (${root}js/nav.js)`);
  for (const page of [`${root}accessibility.html`, `${root}privacy.html`]) {
    if (!html.includes(`href="${page}"`)) errors.push(`footer is missing the link to ${page}`);
  }
  if (isSummary) {
    const articles = html.match(/<article class="summary" data-system="[^"]*">/g) ?? [];
    if (articles.length !== 1 || articles[0] !== `<article class="summary" data-system="${id}">`) {
      errors.push(`needs exactly one <article class="summary" data-system="${id}">`);
    }
    if (!html.includes('data-print')) errors.push('missing the print / PDF button');
  }
  return errors;
}

/** Problems with the root pages (home, quiz, print, statement pages). */
export async function checkRootPages(dir = ROOT_DIR) {
  const errors = [];
  for (const file of ROOT_PAGES) {
    let html;
    try {
      html = await readFile(path.join(dir, file), 'utf8');
    } catch {
      errors.push(`${file}: missing`);
      continue;
    }
    for (const e of pageErrors(html, { id: file, isSummary: false, root: '' })) errors.push(`${file}: ${e}`);
  }
  return errors;
}

/**
 * Every problem across the summaries: the list, the pages and the stylesheet's accents.
 * `subjectIds` are the catalog's subject ids; each summary's `subject` must be one of them.
 */
export async function checkSummaries(subjectIds, dir = SUMMARY_DIR, cssFile = SUMMARY_CSS) {
  const errors = [];
  const ids = SUMMARIES.map((s) => s.id);
  if (new Set(ids).size !== ids.length) errors.push('js/summary-list.js: duplicate id');
  for (const s of SUMMARIES) {
    if (!/^[a-z0-9-]+$/.test(s.id)) errors.push(`js/summary-list.js: bad id "${s.id}"`);
    if (!s.title || !s.blurb) errors.push(`js/summary-list.js: ${s.id} needs a title and a blurb`);
    if (!subjectIds.includes(s.subject)) {
      errors.push(`js/summary-list.js: ${s.id} has subject "${s.subject}", which is not an id in quizzes/subjects.json`);
    }
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
    for (const e of pageErrors(html, { id, isSummary: listed.has(file) })) errors.push(`summaries/${file}: ${e}`);
  }

  const css = await readFile(cssFile, 'utf8');
  for (const id of ids) {
    if (!css.includes(`[data-system="${id}"]`)) errors.push(`css/summary.css: no accent colors for "${id}"`);
  }
  return errors;
}
