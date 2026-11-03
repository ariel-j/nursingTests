// Checks for the interactive tools (tools/*.html), used by validate and the tests.
// A tool is linked from its subject's "tools" in quizzes/subjects.json (validate checks the link).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as data from '../js/tool-core.js';
import { drillItemErrors } from '../js/tool-core.js';
import { pageErrors } from './summaries.mjs';

export const TOOL_DIR = fileURLToPath(new URL('../tools/', import.meta.url));

/** Every drill list in tool-core.js must be well formed. */
export function drillDataErrors() {
  const lists = {
    SORTER_ITEMS: data.SORTER_ITEMS,
    AIDE_ITEMS: data.AIDE_ITEMS,
    CIRCULARS_QUIZ: data.CIRCULARS_QUIZ,
    DIAGNOSIS_ITEMS: data.DIAGNOSIS_ITEMS,
    SAFETY_QUIZ: data.SAFETY_QUIZ,
  };
  return Object.entries(lists).flatMap(([name, items]) =>
    items.flatMap((item, i) => drillItemErrors(item, `js/tool-core.js ${name}[${i}]`)),
  );
}

/** Page rules for every tools/<id>.html, and that its script finds every element it looks up. */
export async function checkTools(dir = TOOL_DIR) {
  const errors = drillDataErrors();
  const files = (await readdir(dir)).filter((f) => f.endsWith('.html'));
  for (const file of files) {
    const id = file.replace(/\.html$/, '');
    const html = await readFile(path.join(dir, file), 'utf8');
    for (const e of pageErrors(html, { id, isSummary: false })) errors.push(`tools/${file}: ${e}`);
    const script = path.join(dir, '..', 'js', `tool-${id}.js`);
    let source;
    try {
      source = await readFile(script, 'utf8');
    } catch {
      errors.push(`tools/${file}: js/tool-${id}.js is missing`);
      continue;
    }
    if (!html.includes(`src="../js/tool-${id}.js"`)) errors.push(`tools/${file}: does not load js/tool-${id}.js`);
    for (const [, elementId] of source.matchAll(/getElementById\('([^']+)'\)/g)) {
      if (!html.includes(`id="${elementId}"`)) errors.push(`tools/${file}: js/tool-${id}.js needs an element with id="${elementId}"`);
    }
  }
  return errors;
}
