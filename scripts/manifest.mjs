// Regenerates quizzes/manifest.json and media/manifest.json. Refuses to write the quiz manifest while
// the catalog or any quiz is invalid.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkMedia, mediaTotal } from './media.mjs';
import { MANIFEST_FILE, QUIZ_DIR, buildManifest, countQuizzes, loadAll, serializeManifest } from './quizzes.mjs';

const { failures, catalog, entries } = await loadAll();
if (failures > 0) {
  console.error('\nManifest not written: fix the errors above first.');
  process.exit(1);
}

const manifest = buildManifest(entries.map((e) => e.quiz), catalog);
await writeFile(path.join(QUIZ_DIR, MANIFEST_FILE), serializeManifest(manifest));
console.log(`Wrote ${MANIFEST_FILE} with ${countQuizzes(manifest)} quiz(zes).`);

const media = await checkMedia(catalog.subjects.map((s) => s.id), { write: true });
for (const w of media.warnings) console.warn(`warning: ${w}`);
for (const e of media.errors) console.error(e);
console.log(`Wrote media/manifest.json with ${mediaTotal(media.manifest)} item(s).`);
if (media.errors.length > 0) process.exit(1);
