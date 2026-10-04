// Regenerates media/manifest.json only (the GitHub Action runs this after an upload to media/).
// Files with errors are left out; the errors still fail the run so the owner gets notified.
import { checkMedia, mediaTotal } from './media.mjs';
import { loadCatalog } from './quizzes.mjs';

const { catalog, errors: catalogErrors } = await loadCatalog();
if (catalogErrors.length > 0) {
  for (const e of catalogErrors) console.error(`quizzes/subjects.json: ${e}`);
  process.exit(1);
}
const { manifest, errors, warnings } = await checkMedia(catalog.subjects.map((s) => s.id), { write: true });
for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(e);
console.log(`Wrote media/manifest.json with ${mediaTotal(manifest)} item(s).`);
if (errors.length > 0) process.exit(1);
