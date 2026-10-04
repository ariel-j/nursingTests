// Validates the catalog and every quiz, checks that the manifest is up to date, and checks the
// summaries and the site pages.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST_FILE, QUIZ_DIR, buildManifest, loadAll, serializeManifest } from './quizzes.mjs';
import { checkMedia, mediaTotal } from './media.mjs';
import { checkRootPages, checkSummaries } from './summaries.mjs';
import { SUMMARIES } from '../js/summary-list.js';

let { failures, catalog, entries } = await loadAll();

if (failures === 0) {
  const expected = serializeManifest(buildManifest(entries.map((e) => e.quiz), catalog));
  let actual = null;
  try {
    actual = await readFile(path.join(QUIZ_DIR, MANIFEST_FILE), 'utf8');
  } catch {
    // reported below
  }
  if (actual === null || JSON.stringify(JSON.parse(actual)) !== JSON.stringify(JSON.parse(expected))) {
    console.error(`${MANIFEST_FILE}: missing or out of date, run "npm run manifest".`);
    failures += 1;
  }
}

const subjectIds = catalog ? catalog.subjects.map((s) => s.id) : [];
const pageErrors = [...await checkSummaries(subjectIds), ...await checkRootPages()];
for (const e of pageErrors) console.error(e);
failures += pageErrors.length;

const media = await checkMedia(subjectIds);
for (const w of media.warnings) console.warn(`warning: ${w}`);
for (const e of media.errors) console.error(e);
failures += media.errors.length;

if (failures > 0) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
const questions = entries.reduce((n, e) => n + e.quiz.questions.length, 0);
console.log(`OK: ${entries.length} quiz(zes), ${questions} question(s), manifest up to date, ${SUMMARIES.length} summaries, ${mediaTotal(media.manifest)} media item(s).`);
