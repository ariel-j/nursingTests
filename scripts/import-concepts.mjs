// Usage: npm run import-concepts -- <source.json> [--subject <id>] [--deck <name> --title "<text>" --unit "<catalog unit>"]
// With --deck the result is an extra deck, data/<id>/concepts-<name>.json, kept apart from the main
// deck (own title, every topic under --unit, a test's "normal" published as its classification).
// Converts the authoring file of concepts, numbers, tests, medications, sequences and matching
// sets into data/<subject-id>/concepts.json (learning content only; sources are dropped).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildConceptDeck, conceptDeckErrors, ROOT_DIR } from './concepts.mjs';
import { conceptsUrl, isValidDeckId } from '../js/concepts-core.js';

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith('--'));
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const subjectId = option('--subject') ?? 'nursing-fundamentals';
const deckName = option('--deck');
const title = option('--title');
const unit = option('--unit');
if (!src || !subjectId || (deckName !== null && (!isValidDeckId(deckName) || !title || !unit))) {
  console.error('Usage: npm run import-concepts -- <source.json> [--subject <id>] [--deck <name> --title "<text>" --unit "<catalog unit>"]');
  process.exit(1);
}

try {
  const catalog = JSON.parse(await readFile(path.join(ROOT_DIR, 'quizzes/subjects.json'), 'utf8'));
  const subject = catalog.subjects.find((s) => s.id === subjectId);
  if (!subject) throw new Error(`no subject "${subjectId}" in quizzes/subjects.json`);
  const source = JSON.parse(await readFile(src, 'utf8'));
  const deck = deckName === null
    ? buildConceptDeck(source)
    : buildConceptDeck(source, Object.fromEntries((source.topics ?? []).map((t) => [t.id, unit])), { title, statusForNormal: true });
  const errors = conceptDeckErrors(deck, subject);
  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  const out = path.join(ROOT_DIR, conceptsUrl(subjectId, deckName));
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(deck, null, 2)}\n`);
  const count = (list) => deck.topics.reduce((n, t) => n + (t[list]?.length ?? 0), 0);
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${deck.topics.length} topics, ${count('concepts')} concepts, ${count('numbers')} numbers, ${count('tests')} tests, ${count('medications')} medications, ${count('sequences')} sequences, ${count('matches')} matching sets.`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
