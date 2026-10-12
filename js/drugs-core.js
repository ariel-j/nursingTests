// Pure logic for the drug cards (כרטיסיות תרופות): a subject's drug list in
// data/<subject-id>/drugs.json, browsed, matched and turned into a multiple-choice quiz for the
// quiz engine. No DOM and no storage. Randomness is injected as `rng`; the generated quiz is
// deterministic (seeded per question) so a saved session still matches it after a reload.
import { OPTION_COUNT, hasPositionalReference, isValidQuizId, shuffle } from './core.js';

/** The fields a drug is learned by, in display order. `short` is used in question ids. */
export const DRUG_FIELDS = [
  { key: 'receptor', short: 'r', label: 'רצפטור / מטרה' },
  { key: 'mechanism', short: 'm', label: 'מנגנון' },
  { key: 'indications', short: 'i', label: 'אינדיקציות' },
  { key: 'sideEffects', short: 's', label: 'תופעות לוואי' },
];
/** Fields that make good quiz and matching material (receptors repeat too much within a family). */
export const PRACTICE_FIELDS = ['mechanism', 'indications', 'sideEffects'];

const QUESTION_TEXT = {
  mechanism: (name) => `מה מנגנון הפעולה של ${name}?`,
  indications: (name) => `מהן האינדיקציות של ${name}?`,
  sideEffects: (name) => `מהן תופעות הלוואי של ${name}?`,
};
const NOTE_TEXT = {
  mechanism: (name) => `זה המנגנון של ${name}.`,
  indications: (name) => `אלה האינדיקציות של ${name}.`,
  sideEffects: (name) => `אלה תופעות הלוואי של ${name}.`,
  name: (drug) => `${drug.name}: ${drug.mechanism}${drug.indications ? `; ${drug.indications}` : ''}.`,
};

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const DRUG_KEYS = new Set(['name', 'family', 'receptor', 'mechanism', 'indications', 'sideEffects', 'alsoIn', 'exam']);

/** Problems with a drug deck ({ families, drugs }); an empty list means it is valid. */
export function validateDrugDeck(deck) {
  if (!isPlainObject(deck)) return ['drug deck must be a JSON object'];
  const errors = [];
  if (!Array.isArray(deck.families) || deck.families.length === 0 || !deck.families.every(isText)) {
    return ['families must be a non-empty array of names'];
  }
  if (new Set(deck.families).size !== deck.families.length) errors.push('duplicate family name');
  if (!Array.isArray(deck.drugs) || deck.drugs.length === 0) return [...errors, 'drugs must be a non-empty array'];
  const families = new Set(deck.families);
  const names = new Set();
  deck.drugs.forEach((d, i) => {
    const where = `drugs[${i}]${isPlainObject(d) && isText(d.name) ? ` (${d.name})` : ''}`;
    if (!isPlainObject(d)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    for (const key of Object.keys(d)) if (!DRUG_KEYS.has(key)) errors.push(`${where}: unknown field "${key}"`);
    if (!isText(d.name)) errors.push(`${where}: name must be a non-empty string`);
    else if (names.has(d.name)) errors.push(`${where}: duplicate name`);
    else names.add(d.name);
    if (!families.has(d.family)) errors.push(`${where}: family must be one of families`);
    for (const { key } of DRUG_FIELDS) {
      if (typeof d[key] !== 'string') errors.push(`${where}: ${key} must be a string (empty when unknown)`);
    }
    if (!Array.isArray(d.alsoIn) || !d.alsoIn.every((f) => families.has(f))) {
      errors.push(`${where}: alsoIn must be an array of family names`);
    }
    if (typeof d.exam !== 'boolean') errors.push(`${where}: exam must be true or false`);
  });
  return errors;
}

/** Where a subject's drug cards live, relative to the site root. */
export const drugDeckUrl = (subjectId) => `data/${encodeURIComponent(subjectId)}/drugs.json`;

// ---------- ids and seeded randomness ----------

/** 32-bit FNV-1a of a string. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable, storage-safe id of a drug, from its name. */
export function drugId(drug) {
  return `d${hash(drug.name).toString(36)}`;
}

/** A deterministic rng (mulberry32) seeded from a string. */
export function seededRng(seed) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- text overlap ----------

const normalize = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();

const itemCache = new Map();

/** The separate items of a field ("טכיקרדיה, יובש פה" → two items), normalized. */
export function textItems(text) {
  let items = itemCache.get(text);
  if (!items) {
    items = text.split(/[,;/،]|\s+או\s+/).map(normalize).filter((s) => s.length > 1);
    itemCache.set(text, items);
  }
  return items;
}

// Items shorter than this only overlap when equal ("GI" is inside too many words).
const MIN_CONTAINED = 4;
const itemsOverlap = (x, y) => x === y
  || (Math.min(x.length, y.length) >= MIN_CONTAINED && (x.includes(y) || y.includes(x)));

/**
 * Whether two texts can't both be offered as different answers: equal, or sharing an item, or one
 * item containing another. Two drugs that both list "יתר ל"ד" must not be the right and a "wrong"
 * answer to one question, nor "אנטגוניסט מוסקריני" beside "אנטגוניסט מוסקריני מרכזי".
 */
export function overlaps(a, b) {
  if (normalize(a) === normalize(b)) return true;
  const items = textItems(a);
  return textItems(b).some((y) => items.some((x) => itemsOverlap(x, y)));
}

/**
 * Up to `count` wrong answers for `correct`: texts of other drugs, preferring the same family (the
 * harder, more useful contrast), none overlapping the right answer or each other.
 */
function pickDistractors(drug, others, textOf, count, rng) {
  const correct = textOf(drug);
  const same = shuffle(others.filter((d) => d.family === drug.family), rng);
  const rest = shuffle(others.filter((d) => d.family !== drug.family), rng);
  const picked = [];
  for (const other of [...same, ...rest]) {
    if (picked.length === count) break;
    const text = textOf(other);
    if (!isText(text) || hasPositionalReference(text) || overlaps(text, correct)) continue;
    if (picked.some((p) => overlaps(textOf(p), text))) continue;
    picked.push(other);
  }
  return picked;
}

/** The drug's card as one paragraph, used as the explanation of every question about it. */
export function drugSummary(drug) {
  const parts = DRUG_FIELDS.filter(({ key }) => isText(drug[key])).map(({ key, label }) => `${label}: ${drug[key]}`);
  return `${drug.name} (${drug.family}). ${parts.join(' · ')}.`;
}

const reverseClue = (drug) => (isText(drug.indications)
  ? `איזו תרופה: ${drug.mechanism}, ומשמשת ל: ${drug.indications}?`
  : `איזו תרופה: ${drug.mechanism}?`);

/**
 * The multiple-choice quiz of a drug deck, in the quiz engine's format. Per drug: its mechanism,
 * indications and side effects (when known), and the reverse, "which drug is this?". Topic = family.
 * A question is left out when there are not enough non-overlapping wrong answers.
 * `examOnly` keeps the drugs marked as having appeared in exams.
 */
export function buildDrugQuiz(deck, { id, subject, unit, examOnly = false } = {}) {
  if (!isValidQuizId(id)) throw new Error(`invalid quiz id: ${id}`);
  const drugs = examOnly ? deck.drugs.filter((d) => d.exam) : deck.drugs;
  const questions = [];
  for (const drug of drugs) {
    const others = deck.drugs.filter((d) => d !== drug);
    const base = drugId(drug);
    const explanation = drugSummary(drug);

    for (const field of PRACTICE_FIELDS) {
      if (!isText(drug[field])) continue;
      const qid = `${base}-${DRUG_FIELDS.find((f) => f.key === field).short}`;
      const wrong = pickDistractors(drug, others, (d) => d[field], OPTION_COUNT - 1, seededRng(qid));
      if (wrong.length < OPTION_COUNT - 1) continue;
      questions.push({
        id: qid,
        topic: drug.family,
        question: QUESTION_TEXT[field](drug.name),
        options: [
          { text: drug[field] },
          ...wrong.map((w) => ({ text: w[field], note: NOTE_TEXT[field](w.name) })),
        ],
        correct: 0,
        explanation,
      });
    }

    // Reverse: from mechanism (and indications) to the name. A drug with the same mechanism would
    // also fit the clue, so those are never offered as wrong answers.
    if (!isText(drug.mechanism)) continue;
    const qid = `${base}-n`;
    const wrong = pickDistractors(
      drug,
      others.filter((d) => !overlaps(d.mechanism, drug.mechanism)),
      (d) => d.name,
      OPTION_COUNT - 1,
      seededRng(qid),
    );
    if (wrong.length === OPTION_COUNT - 1) {
      questions.push({
        id: qid,
        topic: drug.family,
        question: reverseClue(drug),
        options: [{ text: drug.name }, ...wrong.map((w) => ({ text: w.name, note: NOTE_TEXT.name(w) }))],
        correct: 0,
        explanation,
      });
    }
  }
  // Grouped by family in deck order, so the start screen lists the families in that order.
  const order = new Map(deck.families.map((f, i) => [f, i]));
  questions.sort((a, b) => order.get(a.topic) - order.get(b.topic));
  return {
    id,
    subject,
    ...(unit ? { unit } : {}),
    title: examOnly ? 'מבחן תרופות: מה שהופיע במבחנים' : 'מבחן תרופות',
    description: 'שאלות שנוצרות מכרטיסיות התרופות: מנגנון, אינדיקציות ותופעות לוואי של כל תרופה, ולהפך, איזו תרופה מתאימה לתיאור. בחרו משפחות ומספר שאלות.',
    questions,
  };
}

// ---------- browse ----------

/** Drugs matching every word of `query` (in any field), in `family` (null = all), exam-only if asked. */
export function filterDrugs(drugs, { query = '', family = null, examOnly = false } = {}) {
  const words = normalize(query).split(' ').filter(Boolean);
  return drugs.filter((d) => {
    if (family !== null && d.family !== family && !d.alsoIn.includes(family)) return false;
    if (examOnly && !d.exam) return false;
    if (words.length === 0) return true;
    const hay = normalize([d.name, d.family, ...DRUG_FIELDS.map(({ key }) => d[key])].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

// ---------- matching game ----------

export const MATCH_SIZE = 5;

/**
 * One round of the matching game: up to `size` drugs from `drugs` that have `field`, with
 * pairwise non-overlapping names and texts so each text fits exactly one name. `weights`
 * ({ [drugId]: number }, default 1) makes drugs missed before come up more often.
 * Returns { field, pairs: [{ id, name, text }] in name order, texts: ids in shuffled order }.
 */
export function buildMatchRound(drugs, { field, size = MATCH_SIZE, weights = {} } = {}, rng = Math.random) {
  if (!PRACTICE_FIELDS.includes(field)) throw new Error(`unknown field: ${field}`);
  let pool = drugs.filter((d) => isText(d[field]));
  const picked = [];
  while (picked.length < size && pool.length > 0) {
    const total = pool.reduce((n, d) => n + Math.max(1, weights[drugId(d)] ?? 1), 0);
    let r = rng() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= Math.max(1, weights[drugId(pool[i])] ?? 1);
      if (r < 0) {
        index = i;
        break;
      }
    }
    const drug = pool[index];
    picked.push(drug);
    pool = pool.filter((d) => d !== drug && !overlaps(d[field], drug[field]) && !overlaps(d.name, drug.name));
  }
  const pairs = picked.map((d) => ({ id: drugId(d), name: d.name, text: d[field] }));
  return { field, pairs, texts: shuffle(pairs.map((p) => p.id), rng) };
}

/** Weights for the next rounds after a round: a missed drug weighs more, a clean match decays. */
export function updateMatchWeights(weights, results) {
  const next = { ...weights };
  for (const [id, missed] of Object.entries(results)) {
    const w = next[id] ?? 1;
    next[id] = missed ? Math.min(w + 2, 9) : Math.max(1, w - 1);
    if (next[id] === 1) delete next[id];
  }
  return next;
}
