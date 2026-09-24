// Regenerates quizzes/manifest.json. Refuses to write it while any quiz is invalid.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST_FILE, QUIZ_DIR, buildManifest, loadQuizzes, reportErrors, serializeManifest } from './quizzes.mjs';

const entries = await loadQuizzes();
if (reportErrors(entries) > 0) {
  console.error('\nManifest not written: fix the errors above first.');
  process.exit(1);
}

const manifest = buildManifest(entries.map((e) => e.quiz));
await writeFile(path.join(QUIZ_DIR, MANIFEST_FILE), serializeManifest(manifest));
console.log(`Wrote ${MANIFEST_FILE} with ${manifest.quizzes.length} quiz(zes).`);
