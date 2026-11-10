// Validates the catalog and every quiz, checks that the manifest is up to date, and checks the summaries.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST_FILE, QUIZ_DIR, buildManifest, loadAll, serializeManifest } from './quizzes.mjs';
import { checkSummaries, loadSummaryList } from './summaries.mjs';

let { failures, catalog, entries, deckEntries, videoEntries } = await loadAll();

if (failures === 0) {
  const expected = serializeManifest(buildManifest(entries.map((e) => e.quiz), catalog, deckEntries.map((e) => e.deck), videoEntries.map((e) => e.video)));
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

const summaryErrors = await checkSummaries();
for (const e of summaryErrors) console.error(e);
failures += summaryErrors.length;

if (failures > 0) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
const questions = entries.reduce((n, e) => n + e.quiz.questions.length, 0);
console.log(`OK: ${entries.length} quiz(zes), ${questions} question(s), ${deckEntries.length} deck(s), ${videoEntries.filter((e) => e.video).length} video(s), manifest up to date, ${(await loadSummaryList()).length} summaries.`);
