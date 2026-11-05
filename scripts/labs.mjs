// Checks for the interactive labs (labs/*.html), used by validate and the tests.
// Same site rules as the summaries (no external resources, toolbar, footer links), plus the lab
// script and an accent per lab.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABS, labFile } from '../js/lab-list.js';
import { pageErrors } from './summaries.mjs';

export const LAB_DIR = fileURLToPath(new URL('../labs/', import.meta.url));
export const LAB_CSS = fileURLToPath(new URL('../css/lab.css', import.meta.url));
const SUPPORT_PAGES = new Set(['index.html']);

/** Problems with one lab page's HTML. `isLab` adds the checks for a lab's content page. */
export function labPageErrors(html, { id, isLab }) {
  const errors = pageErrors(html, { id, isSummary: false });
  if (isLab) {
    if (!html.includes('src="../js/lab.js"')) errors.push('missing the lab script (../js/lab.js)');
    if (!html.includes(`data-lab="${id}"`)) errors.push(`needs data-lab="${id}"`);
  }
  return errors;
}

/** Every problem across the labs: the list, the pages and the stylesheet's accents. */
export async function checkLabs(dir = LAB_DIR, cssFile = LAB_CSS) {
  const errors = [];
  const ids = LABS.map((l) => l.id);
  if (new Set(ids).size !== ids.length) errors.push('js/lab-list.js: duplicate id');
  for (const l of LABS) {
    if (!/^[a-z0-9-]+$/.test(l.id)) errors.push(`js/lab-list.js: bad id "${l.id}"`);
    if (!l.title || !l.blurb) errors.push(`js/lab-list.js: ${l.id} needs a title and a blurb`);
  }

  const files = (await readdir(dir)).filter((f) => f.endsWith('.html'));
  const listed = new Set(ids.map(labFile));
  for (const file of files) {
    if (!SUPPORT_PAGES.has(file) && !listed.has(file)) errors.push(`labs/${file}: not listed in js/lab-list.js`);
  }
  for (const file of [...SUPPORT_PAGES, ...listed]) {
    if (!files.includes(file)) {
      errors.push(`labs/${file}: missing`);
      continue;
    }
    const html = await readFile(path.join(dir, file), 'utf8');
    const id = file.replace(/\.html$/, '');
    for (const e of labPageErrors(html, { id, isLab: listed.has(file) })) errors.push(`labs/${file}: ${e}`);
  }

  const css = await readFile(cssFile, 'utf8');
  for (const id of ids) {
    if (!css.includes(`[data-lab="${id}"]`)) errors.push(`css/lab.css: no accent colors for "${id}"`);
  }
  return errors;
}
