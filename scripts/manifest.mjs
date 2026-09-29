// Regenerates quizzes/manifest.json. Refuses to write it while the catalog or any quiz is invalid.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST_FILE, QUIZ_DIR, buildManifest, countQuizzes, loadAll, serializeManifest } from './quizzes.mjs';

const { failures, catalog, entries } = await loadAll();
if (failures > 0) {
  console.error('\nManifest not written: fix the errors above first.');
  process.exit(1);
}

const manifest = buildManifest(entries.map((e) => e.quiz), catalog);
await writeFile(path.join(QUIZ_DIR, MANIFEST_FILE), serializeManifest(manifest));
console.log(`Wrote ${MANIFEST_FILE} with ${countQuizzes(manifest)} quiz(zes).`);
