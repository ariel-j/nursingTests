// Usage: npm run import-concepts -- <source.json> [--subject <id>]
// Converts the authoring file of concepts, numbers, tests, medications, sequences and matching
// sets into data/<subject-id>/concepts.json (learning content only; sources are dropped).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildConceptDeck, conceptDeckErrors, ROOT_DIR } from './concepts.mjs';
import { conceptsUrl } from '../js/concepts-core.js';

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith('--'));
const flag = args.indexOf('--subject');
const subjectId = flag === -1 ? 'nursing-fundamentals' : args[flag + 1];
if (!src || !subjectId) {
  console.error('Usage: npm run import-concepts -- <source.json> [--subject <id>]');
  process.exit(1);
}

try {
  const catalog = JSON.parse(await readFile(path.join(ROOT_DIR, 'quizzes/subjects.json'), 'utf8'));
  const subject = catalog.subjects.find((s) => s.id === subjectId);
  if (!subject) throw new Error(`no subject "${subjectId}" in quizzes/subjects.json`);
  const deck = buildConceptDeck(JSON.parse(await readFile(src, 'utf8')));
  const errors = conceptDeckErrors(deck, subject);
  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  const out = path.join(ROOT_DIR, conceptsUrl(subjectId));
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(deck, null, 2)}\n`);
  const count = (list) => deck.topics.reduce((n, t) => n + (t[list]?.length ?? 0), 0);
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${deck.topics.length} topics, ${count('concepts')} concepts, ${count('numbers')} numbers, ${count('tests')} tests, ${count('medications')} medications, ${count('sequences')} sequences, ${count('matches')} matching sets.`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
