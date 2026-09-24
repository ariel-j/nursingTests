// Validates every quiz and checks that the manifest is up to date.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST_FILE, QUIZ_DIR, buildManifest, loadQuizzes, reportErrors, serializeManifest } from './quizzes.mjs';

const entries = await loadQuizzes();
let failures = reportErrors(entries);

if (failures === 0) {
  const expected = serializeManifest(buildManifest(entries.map((e) => e.quiz)));
  let actual = null;
  try {
    actual = await readFile(path.join(QUIZ_DIR, MANIFEST_FILE), 'utf8');
  } catch {
    // reported below
  }
  if (actual === null || JSON.stringify(JSON.parse(actual)) !== JSON.stringify(JSON.parse(expected))) {
    console.error(`${MANIFEST_FILE}: missing or out of date — run "npm run manifest".`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
const questions = entries.reduce((n, e) => n + e.quiz.questions.length, 0);
console.log(`OK: ${entries.length} quiz(zes), ${questions} question(s), manifest up to date.`);
