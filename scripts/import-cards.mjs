// Usage: npm run import-cards -- <cards.json>... [--subject <id>] [--unit "<catalog unit>"]
// Adds flashcard files ({ id, unit, cards: [{ id, topic, front, back }] }) to the subject's concept
// cards (data/<subject-id>/concepts.json) as question/answer cards. Re-importing a file replaces
// its earlier cards; the rest of the deck is kept. Only the card text is published.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildCardTopics, conceptDeckErrors, mergeCardTopics, ROOT_DIR } from './concepts.mjs';
import { conceptsUrl } from '../js/concepts-core.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const subjectId = flag('--subject') ?? 'pharmacology-b';
const unit = flag('--unit');
const files = args.filter((a, i) => !a.startsWith('--') && !['--subject', '--unit'].includes(args[i - 1]));
if (files.length === 0) {
  console.error('Usage: npm run import-cards -- <cards.json>... [--subject <id>] [--unit "<catalog unit>"]');
  process.exit(1);
}

try {
  const catalog = JSON.parse(await readFile(path.join(ROOT_DIR, 'quizzes/subjects.json'), 'utf8'));
  const subject = catalog.subjects.find((s) => s.id === subjectId);
  if (!subject) throw new Error(`no subject "${subjectId}" in quizzes/subjects.json`);
  const units = subject.units ?? [];
  const out = path.join(ROOT_DIR, conceptsUrl(subjectId));
  let deck = { topics: [] };
  try {
    deck = JSON.parse(await readFile(out, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  for (const src of files) {
    const file = JSON.parse(await readFile(src, 'utf8'));
    const topics = buildCardTopics(file, { unit, units });
    deck = mergeCardTopics(deck, file.id, topics, units);
    console.log(`${file.id}: ${topics.reduce((n, t) => n + t.cards.length, 0)} cards in ${topics.length} topics → ${topics[0].unit}`);
  }
  const errors = conceptDeckErrors(deck, subject);
  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(deck, null, 2)}\n`);
  const cards = deck.topics.reduce((n, t) => n + (t.cards?.length ?? 0), 0);
  console.log(`Wrote ${path.relative(process.cwd(), out)}: ${deck.topics.length} topics, ${cards} question/answer cards.`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
