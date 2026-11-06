// Validates the catalog and every quiz, checks that the manifest is up to date, and checks the summaries and labs.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST_FILE, QUIZ_DIR, buildManifest, loadAll, serializeManifest } from './quizzes.mjs';
import { checkSummaries } from './summaries.mjs';
import { checkLabs } from './labs.mjs';
import { SUMMARIES } from '../js/summary-list.js';
import { LABS } from '../js/lab-list.js';

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

const pageProblems = [...(await checkSummaries()), ...(await checkLabs())];
for (const e of pageProblems) console.error(e);
failures += pageProblems.length;

if (failures > 0) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
const questions = entries.reduce((n, e) => n + e.quiz.questions.length, 0);
console.log(`OK: ${entries.length} quiz(zes), ${questions} question(s), manifest up to date, ${SUMMARIES.length} summaries, ${LABS.length} labs.`);
