// Checks for the interactive labs (labs/*.html), used by validate and the tests.
// The pages are hand-written HTML, so this guards the site rules they must keep.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABS, labFile } from '../js/lab-list.js';
import { parseSorter } from '../js/lab-logic.js';
import { pageErrors } from './summaries.mjs';

export const LAB_DIR = fileURLToPath(new URL('../labs/', import.meta.url));
export const LAB_CSS = fileURLToPath(new URL('../css/lab.css', import.meta.url));
export const QUIZ_DIR = fileURLToPath(new URL('../quizzes/', import.meta.url));
const SUPPORT_PAGES = new Set(['index.html']);

/** Problems with one lab page: the shared page rules plus the lab's own hooks. */
export function labPageErrors(html, { id, quiz }) {
  const errors = pageErrors(html, { id, isSummary: false });
  if (!html.includes(`<main class="page wide lab" data-lab="${id}" data-quiz="${quiz}">`)) {
    errors.push(`needs <main class="page wide lab" data-lab="${id}" data-quiz="${quiz}">`);
  }
  if (!html.includes('src="../js/lab.js"')) errors.push('missing the lab script (../js/lab.js)');
  for (const hook of ['id="xp"', 'id="streak"', 'id="quizbox"']) {
    if (!html.includes(hook)) errors.push(`missing ${hook}`);
  }
  for (const match of html.matchAll(/data-sorter="([^"]*)"/g)) {
    try {
      parseSorter(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
    } catch (e) {
      errors.push(`bad sorting card: ${e.message}`);
    }
  }
  return errors;
}

/** Every problem across the labs: the list, the pages, their quizzes and the stylesheet's accents. */
export async function checkLabs(dir = LAB_DIR, cssFile = LAB_CSS, quizDir = QUIZ_DIR) {
  const errors = [];
  const ids = LABS.map((l) => l.id);
  if (new Set(ids).size !== ids.length) errors.push('js/lab-list.js: duplicate id');
  for (const lab of LABS) {
    if (!/^[a-z0-9-]+$/.test(lab.id)) errors.push(`js/lab-list.js: bad id "${lab.id}"`);
    if (!lab.title || !lab.blurb || !lab.quiz) errors.push(`js/lab-list.js: ${lab.id} needs a title, a blurb and a quiz`);
  }

  const files = (await readdir(dir)).filter((f) => f.endsWith('.html'));
  const listed = new Set(ids.map(labFile));
  for (const file of files) {
    if (!SUPPORT_PAGES.has(file) && !listed.has(file)) errors.push(`labs/${file}: not listed in js/lab-list.js`);
  }
  for (const lab of LABS) {
    const file = labFile(lab.id);
    if (!files.includes(file)) {
      errors.push(`labs/${file}: missing`);
      continue;
    }
    const html = await readFile(path.join(dir, file), 'utf8');
    for (const e of labPageErrors(html, lab)) errors.push(`labs/${file}: ${e}`);
    try {
      const quiz = JSON.parse(await readFile(path.join(quizDir, `${lab.quiz}.json`), 'utf8'));
      if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) errors.push(`labs/${file}: quiz ${lab.quiz} has no questions`);
    } catch {
      errors.push(`labs/${file}: quiz "${lab.quiz}" not found in quizzes/`);
    }
  }
  if (files.includes('index.html')) {
    const hub = await readFile(path.join(dir, 'index.html'), 'utf8');
    for (const e of pageErrors(hub, { id: 'index', isSummary: false })) errors.push(`labs/index.html: ${e}`);
  } else {
    errors.push('labs/index.html: missing');
  }

  const css = await readFile(cssFile, 'utf8');
  for (const id of ids) {
    if (!css.includes(`[data-lab="${id}"]`)) errors.push(`css/lab.css: no accent colors for "${id}"`);
  }
  return errors;
}
