// Concept cards (data/<subject-id>/concepts.json): building the published deck from an authoring
// file, and the checks `npm run validate` runs on it (the deck, its units, the generated quiz).
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuiz } from '../js/core.js';
import { buildConceptQuiz, conceptsUrl, validateConceptDeck } from '../js/concepts-core.js';

export const ROOT_DIR = fileURLToPath(new URL('../', import.meta.url));

// Authoring topic id → the catalog unit its questions and summaries live under.
export const UNIT_BY_TOPIC = {
  hygiene: 'היגיינה ואומדן העור',
  tissue: 'שלמות הרקמה',
  mobility: 'ניעות',
  sleep: 'מנוחה ושינה',
  urinary: 'מערכת השתן',
  gi: 'מערכת העיכול',
  sensory: 'גירוי סנסורי',
  safety: 'בטיחות ובטחון',
  laws: 'חוקים וחוזרים',
};

const COPIED = ['concepts', 'numbers', 'medications', 'tests', 'sequences', 'matches'];

/**
 * The published deck from an authoring file ({ topics: [{ id, title, source, ... }] }): only the
 * learning content and the unit. Where the material came from (`source`, `course`, `notes`) is
 * never published. Fields the validator doesn't know are dropped, empty lists too.
 */
export function buildConceptDeck(source, unitByTopic = UNIT_BY_TOPIC) {
  if (!Array.isArray(source?.topics)) throw new Error('the authoring file needs a topics array');
  const topics = [...source.topics]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((t) => {
      const topic = { id: t.id, title: t.title, ...(unitByTopic[t.id] ? { unit: unitByTopic[t.id] } : {}) };
      for (const list of COPIED) if (Array.isArray(t[list]) && t[list].length > 0) topic[list] = t[list];
      return topic;
    });
  return { topics };
}

/** Problems with one deck: its structure, its units against the subject, and the quiz made from it. */
export function conceptDeckErrors(deck, subject) {
  const errors = validateConceptDeck(deck);
  if (errors.length > 0) return errors;
  for (const t of deck.topics) {
    if (t.unit !== undefined && !(subject.units ?? []).includes(t.unit)) {
      errors.push(`topic ${t.id}: unit "${t.unit}" is not a unit of ${subject.id} in quizzes/subjects.json`);
    }
  }
  const quiz = buildConceptQuiz(deck, { id: `concepts-${subject.id}`, subject: subject.name });
  errors.push(...validateQuiz(quiz).map((e) => `generated quiz: ${e}`));
  return errors;
}

/** Problems with every subject's concept cards. */
export async function checkConcepts(catalog, dir = ROOT_DIR) {
  const errors = [];
  let folders = [];
  try {
    folders = (await readdir(path.join(dir, 'data'), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return errors;
  }
  for (const id of folders) {
    const subject = catalog.subjects.find((s) => s.id === id);
    const file = conceptsUrl(id);
    let deck;
    try {
      deck = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') errors.push(`${file}: cannot parse: ${err.message}`);
      continue; // a subject may have drug cards only
    }
    if (!subject) {
      errors.push(`data/${id}: not a subject id in quizzes/subjects.json`);
      continue;
    }
    for (const e of conceptDeckErrors(deck, subject)) errors.push(`${file}: ${e}`);
  }
  return errors;
}
