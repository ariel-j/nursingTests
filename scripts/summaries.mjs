// Checks for the short summaries (summaries/*.html), used by validate and the tests.
// The pages are hand-written HTML, so this guards the site rules they must keep.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIST_FILE, listErrors, summaryFile } from '../js/summary-list.js';
import { pageErrors } from '../js/summary-check.js';

export { pageErrors };

/** The parsed list, for the validate script. */
export async function loadSummaryList(dir = SUMMARY_DIR) {
  return JSON.parse(await readFile(path.join(dir, LIST_FILE), 'utf8')).summaries;
}

export const SUMMARY_DIR = fileURLToPath(new URL('../summaries/', import.meta.url));
export const SUMMARY_CSS = fileURLToPath(new URL('../css/summary.css', import.meta.url));
// Pages in summaries/ that are not summaries themselves.
const SUPPORT_PAGES = new Set(['index.html', 'all.html']);

/** Every problem across the summaries: the list, the pages and the stylesheet's accents. */
export async function checkSummaries(dir = SUMMARY_DIR, cssFile = SUMMARY_CSS) {
  let list;
  try {
    list = JSON.parse(await readFile(path.join(dir, LIST_FILE), 'utf8'));
  } catch (err) {
    return [`summaries/${LIST_FILE}: cannot read: ${err.message}`];
  }
  const errors = listErrors(list).map((e) => `summaries/${LIST_FILE}: ${e}`);
  if (errors.length > 0) return errors;
  const ids = list.summaries.map((s) => s.id);

  const files = (await readdir(dir)).filter((f) => f.endsWith('.html'));
  const listed = new Set(ids.map(summaryFile));
  for (const file of files) {
    if (!SUPPORT_PAGES.has(file) && !listed.has(file)) {
      errors.push(`summaries/${file}: not listed in summaries/list.json`);
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
