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

const COPIED = ['concepts', 'numbers', 'medications', 'tests', 'cards', 'sequences', 'matches'];

// Flashcard files ({ id, unit, cards: [{ id, topic, front, back }] }) → the catalog unit they go under,
// when the file's own unit name is not one. Keyed by the file's id.
export const UNIT_BY_CARD_FILE = {
  'endocrine-1': 'מבוא אנדוקרינולוגיה ויותרת המוח',
  'endocrine-2': 'מבוא אנדוקרינולוגיה ויותרת המוח',
  'sexhormones-1': 'הורמוני מין ואמצעי מניעה',
  'sexhormones-2': 'הורמוני מין ואמצעי מניעה',
  'hypertension-1': 'יתר לחץ דם: ACE, ARB, אלפא, בטא, CCB',
  'diuretics-1': 'משתנים',
  'cardiac-1': 'איסכמיה, אי-ספיקת לב והפרעות קצב',
  'oncology-2': 'אונקולוגיה: משפחות התרופות',
  'oncology-3': 'אונקולוגיה: משפחות התרופות',
  'antibiotics-1': 'אנטיביוטיקה א׳: עקרונות ודופן התא',
  'antibiotics-2': 'אנטיביוטיקה א׳: עקרונות ודופן התא',
  'antibiotics-3': 'אנטיביוטיקה ב׳: סינתזת חלבון וחומצות גרעין',
  'antibiotics-4': 'אנטיביוטיקה ב׳: סינתזת חלבון וחומצות גרעין',
  'tb-antivirals-1': 'שחפת ותרופות נגד וירוסים',
  'hiv-1': 'שחפת ותרופות נגד וירוסים',
  'antifungals-1': 'פטריות, טפילים ותולעים',
  'nursing-routes-1': 'סיעוד: דרכי מתן לא-פרנטרליות',
  'nursing-injections-1': 'סיעוד: הזרקות ומתן דרך הווריד',
  'nursing-injections-2': 'סיעוד: הזרקות ומתן דרך הווריד',
  'circulars-1': 'סיעוד: חוזרים והיבטים חוקיים',
};

// Card text that points at where it came from instead of saying the fact ("השקופית קובעת…").
const COURSE_REFERENCE = /שקופית|מצגת|הרצאה|מרצה|בקורס|בכיתה/;

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const topicIdOf = (fileId, n) => `${fileId}-t${n}`;
const fileOfTopic = (id) => /^(.+)-t\d+$/.exec(id)?.[1] ?? null;

/**
 * The topics of one flashcard file, in the order their first card appears: { id: <file>-t<n>, title,
 * unit, cards: [{ id: <file>-<card id>, q, a }] }. The file's title, description and every field
 * but the card text are dropped. `unit` must be one of `units` (the subject's catalog units).
 */
export function buildCardTopics(file, { unit, units }) {
  if (typeof file?.id !== 'string' || !ID.test(file.id)) throw new Error('the card file needs an id of lowercase letters, digits and hyphens');
  if (!Array.isArray(file.cards) || file.cards.length === 0) throw new Error(`${file.id}: cards must be a non-empty array`);
  const chosen = unit ?? UNIT_BY_CARD_FILE[file.id] ?? file.unit;
  if (!units.includes(chosen)) {
    throw new Error(`${file.id}: unit "${chosen}" is not a unit of the subject; pass --unit with one of: ${units.join(' | ')}`);
  }
  const topics = [];
  const byTitle = new Map();
  for (const card of file.cards) {
    const title = typeof card.topic === 'string' ? card.topic.trim() : '';
    if (!title) throw new Error(`${file.id}/${card.id}: topic must be a non-empty string`);
    if (!byTitle.has(title)) {
      const topic = { id: topicIdOf(file.id, topics.length + 1), title, unit: chosen, cards: [] };
      byTitle.set(title, topic);
      topics.push(topic);
    }
    byTitle.get(title).cards.push({ id: `${file.id}-${card.id}`, q: card.front, a: card.back });
  }
  return topics;
}

/**
 * The deck with one file's topics in place of what an earlier import of that file left, ordered by
 * the catalog's unit order, then by file id (numeric-aware), then topic order. Topics that did not
 * come from a card file keep their place at the front.
 */
export function mergeCardTopics(deck, fileId, topics, units) {
  const kept = (deck?.topics ?? []).filter((t) => fileOfTopic(t.id) !== fileId);
  const imported = [...kept.filter((t) => fileOfTopic(t.id) !== null), ...topics];
  const others = kept.filter((t) => fileOfTopic(t.id) === null);
  const key = (t) => [units.indexOf(t.unit), fileOfTopic(t.id), Number(/-t(\d+)$/.exec(t.id)[1])];
  imported.sort((a, b) => {
    const [ua, fa, na] = key(a);
    const [ub, fb, nb] = key(b);
    return ua - ub || fa.localeCompare(fb, 'en', { numeric: true }) || na - nb;
  });
  return { topics: [...others, ...imported] };
}

/**
 * The published deck from an authoring file ({ topics: [{ id, title, source, ... }] }): only the
 * learning content and the unit. Where the material came from (`source`, `course`, `notes`) is
 * never published. Fields the validator doesn't know are dropped, empty lists too.
 */
export function buildConceptDeck(source, unitByTopic = UNIT_BY_TOPIC, { title, statusForNormal = false } = {}) {
  if (!Array.isArray(source?.topics)) throw new Error('the authoring file needs a topics array');
  const topics = [...source.topics]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((t) => {
      const topic = { id: t.id, title: t.title, ...(unitByTopic[t.id] ? { unit: unitByTopic[t.id] } : {}) };
      for (const list of COPIED) if (Array.isArray(t[list]) && t[list].length > 0) topic[list] = t[list];
      // For rules rather than lab values, a test's "normal" is how the circular classifies it.
      if (statusForNormal && topic.tests) topic.tests = topic.tests.map(({ normal, ...rest }) => (normal === undefined ? rest : { ...rest, status: normal }));
      return topic;
    });
  return { ...(title ? { title } : {}), topics };
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
  for (const t of deck.topics) {
    for (const c of t.cards ?? []) {
      if (COURSE_REFERENCE.test(`${c.q} ${c.a}`)) errors.push(`${c.id}: refers to the course material instead of stating the fact`);
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
    if (!subject) {
      errors.push(`data/${id}: not a subject id in quizzes/subjects.json`);
      continue;
    }
    // concepts.json, and concepts-<deck>.json for each extra deck.
    const names = (await readdir(path.join(dir, 'data', id))).filter((n) => /^concepts(-[a-z0-9]+(-[a-z0-9]+)*)?\.json$/.test(n)).sort();
    for (const name of names) {
      const file = `data/${id}/${name}`;
      let deck;
      try {
        deck = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
      } catch (err) {
        errors.push(`${file}: cannot parse: ${err.message}`);
        continue;
      }
      for (const e of conceptDeckErrors(deck, subject)) errors.push(`${file}: ${e}`);
      for (const q of Array.isArray(deck.quizzes) ? deck.quizzes : []) {
        try {
          await readFile(path.join(dir, 'quizzes', `${q}.json`));
        } catch {
          errors.push(`${file}: quizzes lists "${q}", which is not a file in quizzes/`);
        }
      }
    }
  }
  return errors;
}
