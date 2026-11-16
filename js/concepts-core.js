// Pure logic for the concept cards (כרטיסיות מושגים): a subject's concepts, numbers, tests,
// medications, question/answer cards, sequences and matching sets in data/<subject-id>/concepts.json, flattened into
// flashcards, a daily review, the question games and a generated multiple-choice quiz.
// No DOM and no storage. Randomness is injected as `rng`; the generated quiz is deterministic
// (seeded per question) so a saved session still matches it after a reload.
import { OPTION_COUNT, hasPositionalReference, isValidQuizId, shuffle } from './core.js';
import {
  DAILY_SIZE,
  MASTERED_BOX,
  MATCH_SIZE,
  gradeReview,
  overlaps,
  sanitizeReview,
  seededRng,
} from './drugs-core.js';

export { gradeReview, sanitizeReview, updateMatchWeights } from './drugs-core.js';

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Where a subject's concept cards live, relative to the site root. */
export const conceptsUrl = (subjectId, deck = null) => `data/${encodeURIComponent(subjectId)}/concepts${deck ? `-${deck}` : ''}.json`;

/** A subject may have extra decks beside the main one: `concepts-<deck>.json`, opened with `&deck=<deck>`. */
export const isValidDeckId = (deck) => typeof deck === 'string' && ID_PATTERN.test(deck);

/** Storage key part for one deck: the subject id, plus the deck when it is not the main one. */
export const deckKey = (subjectId, deck = null) => (deck ? `${subjectId}:${deck}` : subjectId);

// ---------- validation ----------

// Each list of a topic: the required text fields, the optional ones, and whether `id` is needed.
const ITEM_FIELDS = {
  concepts: { required: ['term', 'def'], optional: ['en'] },
  numbers: { required: ['q', 'a'], optional: [] },
  tests: { required: ['name', 'purpose'], optional: ['en', 'normal', 'status', 'nursing'] },
  medications: { required: ['name', 'action'], optional: ['en', 'group', 'nursing'] },
  cards: { required: ['q', 'a'], optional: [] },
};
const LISTS = [...Object.keys(ITEM_FIELDS), 'sequences', 'matches'];

/** Problems with a concept deck ({ topics: [...] }); an empty list means it is valid. */
export function validateConceptDeck(deck) {
  if (!isPlainObject(deck)) return ['concept deck must be a JSON object'];
  if (!Array.isArray(deck.topics) || deck.topics.length === 0) return ['topics must be a non-empty array'];
  const errors = [];
  if (deck.title !== undefined && !isText(deck.title)) errors.push('title must be a non-empty string');
  // Full quizzes of the subject this deck links to from its מבחן tab.
  if (deck.quizzes !== undefined && (!Array.isArray(deck.quizzes) || !deck.quizzes.every((id) => typeof id === 'string' && ID_PATTERN.test(id)))) {
    errors.push('quizzes must be an array of quiz ids');
  }
  const ids = new Set();
  const topicIds = new Set();
  const claim = (where, id) => {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) errors.push(`${where}: id must be lowercase letters, digits and hyphens`);
    else if (ids.has(id)) errors.push(`${where}: duplicate id "${id}"`);
    else ids.add(id);
  };
  deck.topics.forEach((topic, i) => {
    const where = `topics[${i}]`;
    if (!isPlainObject(topic)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    if (typeof topic.id !== 'string' || !ID_PATTERN.test(topic.id) || topicIds.has(topic.id)) {
      errors.push(`${where}: id must be unique lowercase letters, digits and hyphens`);
    }
    topicIds.add(topic.id);
    if (!isText(topic.title)) errors.push(`${where}: title must be a non-empty string`);
    if (topic.unit !== undefined && !isText(topic.unit)) errors.push(`${where}: unit must be a non-empty string`);
    for (const list of LISTS) {
      if (topic[list] !== undefined && !Array.isArray(topic[list])) errors.push(`${where}.${list}: must be an array`);
    }
    for (const [list, { required, optional }] of Object.entries(ITEM_FIELDS)) {
      (topic[list] ?? []).forEach((item, j) => {
        const at = `${where}.${list}[${j}]`;
        if (!isPlainObject(item)) {
          errors.push(`${at}: must be an object`);
          return;
        }
        claim(at, item.id);
        for (const f of required) if (!isText(item[f])) errors.push(`${at}: ${f} must be a non-empty string`);
        for (const f of optional) if (item[f] !== undefined && typeof item[f] !== 'string') errors.push(`${at}: ${f} must be a string`);
        const known = new Set(['id', ...required, ...optional]);
        for (const k of Object.keys(item)) if (!known.has(k)) errors.push(`${at}: unknown field "${k}"`);
      });
    }
    (topic.sequences ?? []).forEach((seq, j) => {
      const at = `${where}.sequences[${j}]`;
      if (!isPlainObject(seq)) {
        errors.push(`${at}: must be an object`);
        return;
      }
      claim(at, seq.id);
      if (!isText(seq.title)) errors.push(`${at}: title must be a non-empty string`);
      if (!Array.isArray(seq.steps) || seq.steps.length < 2 || !seq.steps.every(isText)) {
        errors.push(`${at}: steps must be 2 or more non-empty strings`);
      } else if (new Set(seq.steps.map((s) => s.trim())).size !== seq.steps.length) {
        errors.push(`${at}: steps must differ from each other`);
      }
    });
    (topic.matches ?? []).forEach((set, j) => {
      const at = `${where}.matches[${j}]`;
      if (!isPlainObject(set)) {
        errors.push(`${at}: must be an object`);
        return;
      }
      claim(at, set.id);
      if (!isText(set.title)) errors.push(`${at}: title must be a non-empty string`);
      if (!Array.isArray(set.pairs) || set.pairs.length < 2) {
        errors.push(`${at}: pairs must be 2 or more { a, b }`);
        return;
      }
      if (!set.pairs.every((p) => isPlainObject(p) && isText(p.a) && isText(p.b))) {
        errors.push(`${at}: every pair needs non-empty a and b`);
        return;
      }
      // Several items may share an answer ("Valium, Haldol ← הגבלה כימית"); the prompt side must be unique.
      if (new Set(set.pairs.map((p) => p.a.trim())).size !== set.pairs.length) errors.push(`${at}: "a" sides must differ from each other`);
    });
  });
  return errors;
}

// ---------- flashcards ----------

/** The kinds the browse tab and the daily review show, in display order. */
export const CARD_KINDS = [
  { key: 'concept', label: 'מושגים' },
  { key: 'number', label: 'מספרים' },
  { key: 'test', label: 'בדיקות ופעולות' },
  { key: 'med', label: 'תרופות' },
  { key: 'qa', label: 'שאלות ותשובות' },
];
/** Browse also lists the sequences and the matching sets (they are not flashcards). */
export const BROWSE_KINDS = [...CARD_KINDS, { key: 'sequence', label: 'סדרים' }, { key: 'match', label: 'התאמות' }];

const row = (label, text) => (isText(text) ? [{ label, text }] : []);

/**
 * Every flashcard of the deck: { id, kind, topic (id), topicTitle, front, en, rows: [{ label, text }] }.
 * The front is what to recall from; the rows are the answer.
 */
export function buildCards(deck) {
  const cards = [];
  for (const t of deck.topics) {
    const base = { topic: t.id, topicTitle: t.title };
    for (const c of t.concepts ?? []) {
      cards.push({ ...base, id: c.id, kind: 'concept', front: c.term, en: c.en ?? '', rows: row('הסבר', c.def) });
    }
    for (const n of t.numbers ?? []) {
      cards.push({ ...base, id: n.id, kind: 'number', front: n.q, en: '', rows: row('ערך', n.a) });
    }
    for (const x of t.tests ?? []) {
      cards.push({
        ...base,
        id: x.id,
        kind: 'test',
        front: x.name,
        en: x.en ?? '',
        rows: [...row('מטרה', x.purpose), ...row('ערכים תקינים', x.normal), ...row('סיווג', x.status), ...row('תפקיד האחות', x.nursing)],
      });
    }
    for (const m of t.medications ?? []) {
      cards.push({
        ...base,
        id: m.id,
        kind: 'med',
        front: m.name,
        en: m.en ?? '',
        rows: [...row('קבוצה', m.group), ...row('פעולה', m.action), ...row('תפקיד האחות', m.nursing)],
      });
    }
    for (const x of t.cards ?? []) {
      cards.push({ ...base, id: x.id, kind: 'qa', front: x.q, en: '', rows: row('תשובה', x.a) });
    }
  }
  return cards;
}

const normalize = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const cardText = (c) => normalize([c.front, c.en, ...c.rows.map((r) => r.text)].join(' '));

/**
 * Cards matching every word of `query` (in any field), of the given `kind` (null = all) and in
 * one of `topics` (ids; null = all).
 */
export function filterCards(cards, { query = '', kind = null, topics = null } = {}) {
  const words = normalize(query).split(' ').filter(Boolean);
  const wanted = topics ? new Set(topics) : null;
  return cards.filter((c) => (kind === null || c.kind === kind)
    && (wanted === null || wanted.has(c.topic))
    && words.every((w) => cardText(c).includes(w)));
}

/**
 * What the browse tab lists, grouped by topic in deck order: the flashcards that match
 * (see filterCards), and for kind null / 'sequence' / 'match' the sequences and matching sets whose
 * text matches every word of the query. Topics with nothing left are dropped.
 * Returns [{ topic: { id, title }, items: [{ type: 'card' | 'sequence' | 'match', ... }] }].
 */
export function buildBrowse(deck, cards, { query = '', kind = null, topics = null } = {}) {
  const words = normalize(query).split(' ').filter(Boolean);
  const wanted = topics ? new Set(topics) : null;
  const matches = (text) => words.every((w) => normalize(text).includes(w));
  const shown = new Set(filterCards(cards, { query, kind, topics }).map((c) => c.id));
  const groups = [];
  for (const t of deck.topics) {
    if (wanted && !wanted.has(t.id)) continue;
    const items = cards.filter((c) => c.topic === t.id && shown.has(c.id)).map((card) => ({ type: 'card', card }));
    if (kind === null || kind === 'sequence') {
      for (const seq of t.sequences ?? []) if (matches([seq.title, ...seq.steps].join(' '))) items.push({ type: 'sequence', seq });
    }
    if (kind === null || kind === 'match') {
      for (const set of t.matches ?? []) if (matches([set.title, ...set.pairs.flatMap((p) => [p.a, p.b])].join(' '))) items.push({ type: 'match', set });
    }
    if (items.length > 0) groups.push({ topic: { id: t.id, title: t.title }, items });
  }
  return groups;
}

/**
 * The deck's topics grouped by unit, in deck order of each unit's first topic:
 * [{ unit, topics: [{ id, title }] }]. Null when grouping adds nothing (no unit has two topics),
 * so a deck with one topic per unit keeps its flat list.
 */
export function topicGroups(deck) {
  const groups = [];
  const byUnit = new Map();
  for (const t of deck.topics) {
    const unit = t.unit ?? '';
    if (!byUnit.has(unit)) {
      const group = { unit, topics: [] };
      byUnit.set(unit, group);
      groups.push(group);
    }
    byUnit.get(unit).topics.push({ id: t.id, title: t.title });
  }
  return groups.some((g) => g.unit !== '' && g.topics.length > 1) ? groups : null;
}

/** The chosen topics from storage: those still in the deck, in deck order; malformed → all. */
export function sanitizeTopics(raw, topicIds) {
  if (!Array.isArray(raw)) return [...topicIds];
  const chosen = topicIds.filter((id) => raw.includes(id));
  return chosen.length === 0 && raw.length > 0 ? [...topicIds] : chosen;
}

// ---------- daily review: Leitner boxes (grading shared with the drug cards) ----------

/** Up to `size` cards for today: the due ones (oldest first), then new ones, missed-in-games first. */
export function dailyCards(cards, review, today, { size = DAILY_SIZE, weights = {} } = {}) {
  const due = cards
    .filter((c) => review[c.id] && review[c.id].due <= today && review[c.id].last !== today)
    .sort((a, b) => review[a.id].due.localeCompare(review[b.id].due));
  const fresh = shuffle(cards.filter((c) => !review[c.id]), seededRng(today))
    .sort((a, b) => (weights[b.id] ?? 1) - (weights[a.id] ?? 1));
  return [...due, ...fresh].slice(0, size);
}

export function cardReviewStats(cards, review, today) {
  const stats = { fresh: 0, learning: 0, mastered: 0, due: 0 };
  for (const c of cards) {
    const e = review[c.id];
    if (!e) stats.fresh += 1;
    else if (e.box >= MASTERED_BOX) stats.mastered += 1;
    else stats.learning += 1;
    if (e && e.due <= today && e.last !== today) stats.due += 1;
  }
  return stats;
}

// ---------- the bank: everything the questions are made of ----------

/**
 * The deck's items by kind, each with its topic (and the topic's unit): concepts, numbers, tests,
 * meds, question/answer cards, sequences and the pairs of the matching sets (with the set they
 * belong to). Wrong answers are drawn from the whole bank.
 */
export function buildBank(deck) {
  const bank = { concepts: [], numbers: [], tests: [], meds: [], cards: [], sequences: [], pairs: [], sets: [], topics: [] };
  for (const t of deck.topics) {
    const at = { topic: t.id, topicTitle: t.title, topicUnit: t.unit ?? '' };
    bank.topics.push({ id: t.id, title: t.title });
    for (const x of t.concepts ?? []) bank.concepts.push({ ...x, ...at });
    for (const x of t.numbers ?? []) bank.numbers.push({ ...x, ...at });
    for (const x of t.tests ?? []) bank.tests.push({ ...x, ...at });
    for (const x of t.medications ?? []) bank.meds.push({ ...x, ...at });
    for (const x of t.cards ?? []) bank.cards.push({ ...x, ...at });
    for (const x of t.sequences ?? []) bank.sequences.push({ ...x, ...at });
    for (const set of t.matches ?? []) {
      bank.sets.push({ ...set, ...at });
      set.pairs.forEach((p, index) => bank.pairs.push({ ...p, ...at, id: `${set.id}-${index + 1}`, index, set: set.id, setTitle: set.title }));
    }
  }
  return bank;
}

// ---------- multiple-choice questions ----------

const trimDot = (s) => s.trim().replace(/[.。]+$/, '');
const withTerm = (x, term) => (x.en ? `${term} (${x.en})` : term);
// Texts that read badly as one of four answers (or as a question) are kept to cards.
const MAX_DEF_AS_QUESTION = 150;
const MAX_DEF_AS_OPTION = 90;
// A question/answer card's answer is a sentence; longer ones stay on the cards and the review.
const MAX_ANSWER_AS_OPTION = 160;

/**
 * Up to `count` wrong answers for `correct` from `others`, best `rank` first (random among equals),
 * none empty, positional, overlapping the right answer, or overlapping each other; null if too few.
 */
function pickWrong(correct, others, textOf, rng, { rank = () => 0, count = OPTION_COUNT - 1, skip = () => false } = {}) {
  const right = textOf(correct);
  const ordered = shuffle(others, rng).sort((a, b) => rank(a) - rank(b));
  const picked = [];
  for (const other of ordered) {
    if (picked.length === count) break;
    const text = textOf(other);
    if (other === correct || !isText(text) || hasPositionalReference(text) || skip(other)) continue;
    if (overlaps(text, right) || picked.some((p) => overlaps(textOf(p), text))) continue;
    picked.push(other);
  }
  return picked.length === count ? picked : null;
}

const sameTopic = (item) => (other) => (other.topic === item.topic ? 0 : 1);

/** A question in the quiz engine's shape (the right option first; the engine reshuffles). */
function question({ id, topic, question: text, right, wrong, explanation }) {
  return {
    id,
    topic,
    question: text,
    options: [{ text: right }, ...wrong.map((w) => ({ text: w.text, ...(w.note ? { note: w.note } : {}) }))],
    correct: 0,
    explanation,
  };
}

// "12 שעות" → "## שעות": answers of the same shape make the harder, fairer choice.
const shapeOf = (answer) => answer.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
const tailOf = (answer) => shapeOf(answer).replace(/^[#\s\-–/.,()]+/, '');

// A number card's front is either already a question ("תוך כמה שעות…") or a label ("עובי הדרמיס").
const asQuestion = (q) => {
  const text = trimDot(q);
  return /[?？]$/.test(text) || /^(?:מה|מהו|מהי|מהם|מהן|איזה|איזו|אילו)(?=\s)|כמה/.test(text)
    ? `${text.replace(/[?？]$/, '')}?`
    : `${text}: מה הערך?`;
};

/** Concept question: `reverse` false = from the explanation to the term, true = from the term to the explanation. */
function conceptQuestion(c, bank, rng, reverse) {
  const label = withTerm(c, c.term);
  const explanation = `${label}: ${c.def}`;
  if (!reverse) {
    if (c.def.length > MAX_DEF_AS_QUESTION) return null;
    const wrong = pickWrong(c, bank.concepts, (x) => x.term, rng, { rank: sameTopic(c) });
    if (!wrong) return null;
    return question({
      id: `${c.id}-d`,
      topic: c.topicTitle,
      question: `לאיזה מושג מתאים ההסבר: ${c.def}`,
      right: c.term,
      wrong: wrong.map((w) => ({ text: w.term, note: `${withTerm(w, w.term)}: ${w.def}` })),
      explanation,
    });
  }
  if (c.def.length > MAX_DEF_AS_OPTION) return null;
  const wrong = pickWrong(c, bank.concepts, (x) => x.def, rng, { rank: sameTopic(c), skip: (x) => x.def.length > MAX_DEF_AS_OPTION });
  if (!wrong) return null;
  return question({
    id: `${c.id}-t`,
    topic: c.topicTitle,
    question: `מה ההסבר ל: ${label}?`,
    right: c.def,
    wrong: wrong.map((w) => ({ text: w.def, note: `זה ההסבר של ${w.term}.` })),
    explanation,
  });
}

function numberQuestion(n, bank, rng) {
  const shape = shapeOf(n.a);
  const tail = tailOf(n.a);
  // Same topic matters less than the same shape: "43-46°C" beside "36-37°C", not beside "3".
  const rank = (o) => (shapeOf(o.a) === shape ? 0 : tailOf(o.a) === tail && tail !== '' ? 2 : 4) + (o.topic === n.topic ? 0 : 1);
  const wrong = pickWrong(n, bank.numbers, (x) => x.a, rng, { rank });
  if (!wrong) return null;
  return question({
    id: `${n.id}-q`,
    topic: n.topicTitle,
    question: asQuestion(n.q),
    right: n.a,
    wrong: wrong.map((w) => ({ text: w.a, note: `${trimDot(w.q)}: ${w.a}` })),
    explanation: `${trimDot(n.q)}: ${n.a}`,
  });
}

function testQuestion(t, bank, rng) {
  const wrong = pickWrong(t, bank.tests, (x) => x.name, rng, {
    rank: sameTopic(t),
    // Another test with the same purpose would also fit the question.
    skip: (x) => overlaps(x.purpose, t.purpose),
  });
  if (!wrong) return null;
  return question({
    id: `${t.id}-q`,
    topic: t.topicTitle,
    question: `איזו בדיקה או פעולה משמשת ל: ${trimDot(t.purpose)}?`,
    right: t.name,
    wrong: wrong.map((w) => ({ text: w.name, note: `${w.name}: ${trimDot(w.purpose)}.` })),
    explanation: `${withTerm(t, t.name)}: ${trimDot(t.purpose)}.${isText(t.nursing) ? ` תפקיד האחות: ${trimDot(t.nursing)}.` : ''}`,
  });
}

/** `byGroup` true = which group the item belongs to; false = which item the action describes. */
function medQuestion(m, bank, rng, byGroup) {
  const explanation = `${withTerm(m, m.name)}${isText(m.group) ? ` (${m.group})` : ''}: ${trimDot(m.action)}.${isText(m.nursing) ? ` תפקיד האחות: ${trimDot(m.nursing)}.` : ''}`;
  if (byGroup) {
    if (!isText(m.group)) return null;
    const wrong = pickWrong(m, bank.meds.filter((x) => isText(x.group)), (x) => x.group, rng, { rank: sameTopic(m) });
    if (!wrong) return null;
    return question({
      id: `${m.id}-g`,
      topic: m.topicTitle,
      question: `לאיזו קבוצה שייך: ${m.name}?`,
      right: m.group,
      wrong: wrong.map((w) => ({ text: w.group, note: `${w.name} שייך ל${w.group}.` })),
      explanation,
    });
  }
  const wrong = pickWrong(m, bank.meds, (x) => x.name, rng, {
    rank: sameTopic(m),
    skip: (x) => overlaps(x.action, m.action),
  });
  if (!wrong) return null;
  return question({
    id: `${m.id}-a`,
    topic: m.topicTitle,
    question: `לאיזו תרופה או גורם מתאים התיאור: ${trimDot(m.action)}?`,
    right: m.name,
    wrong: wrong.map((w) => ({ text: w.name, note: `${w.name}: ${trimDot(w.action)}.` })),
    explanation,
  });
}

/**
 * From a question/answer card's question to its answer. Wrong answers are other cards' answers:
 * the same topic first, then the same unit (the closer contrast), never one overlapping the answer.
 */
function qaQuestion(c, bank, rng) {
  const rank = (o) => (o.topic === c.topic ? 0 : o.topicUnit !== '' && o.topicUnit === c.topicUnit ? 1 : 2);
  const wrong = pickWrong(c, bank.cards, (x) => x.a, rng, { rank, skip: (x) => x.a.length > MAX_ANSWER_AS_OPTION });
  if (!wrong) return null;
  const q = c.q.trim();
  return question({
    id: `${c.id}-q`,
    topic: c.topicTitle,
    question: /[?？:]$/.test(q) ? q : `${trimDot(q)}?`,
    right: c.a,
    wrong: wrong.map((w) => ({ text: w.a, note: `זו התשובה לשאלה: ${w.q.trim()}` })),
    explanation: c.a,
  });
}

/** Which step comes after (`after` true) or before step `i` of a sequence; wrong answers are its other steps first. */
function sequenceQuestion(seq, i, after, bank, rng) {
  const target = after ? seq.steps[i + 1] : seq.steps[i - 1];
  if (target === undefined) return null;
  const pool = (s) => s.steps.map((text) => ({ text, topic: s.topic, own: s === seq }));
  const all = bank.sequences.flatMap(pool).filter((x) => x.text !== seq.steps[i] && x.text !== target);
  const wrong = pickWrong({ text: target }, all, (x) => x.text, rng, { rank: (x) => (x.own ? 0 : x.topic === seq.topic ? 1 : 2) });
  if (!wrong) return null;
  const order = seq.steps.join(' ← ');
  return question({
    id: `${seq.id}-${i + 1}${after ? 'a' : 'b'}`,
    topic: seq.topicTitle,
    question: after
      ? `${trimDot(seq.title)}: מה השלב שאחרי «${seq.steps[i]}»?`
      : `${trimDot(seq.title)}: מה השלב שלפני «${seq.steps[i]}»?`,
    right: target,
    wrong: wrong.map((w) => ({ text: w.text, note: w.own ? 'זה שלב אחר באותו סדר.' : 'זה שלב בסדר אחר.' })),
    explanation: `${trimDot(seq.title)}: ${order}`,
  });
}

/** From one side of a matching set to the other; wrong answers are the set's other items first. */
function pairQuestion(p, bank, rng) {
  const wrong = pickWrong(p, bank.pairs, (x) => x.b, rng, { rank: (x) => (x.set === p.set ? 0 : x.topic === p.topic ? 1 : 2) });
  if (!wrong) return null;
  return question({
    id: `${p.id}-p`,
    topic: p.topicTitle,
    question: `${trimDot(p.setTitle)}: מה מתאים ל «${p.a}»?`,
    right: p.b,
    wrong: wrong.map((w) => ({ text: w.b, note: `${w.b} מתאים ל «${w.a}»` })),
    explanation: `${p.a} ← ${p.b}`,
  });
}

/** The question games and which kinds of question each one asks. */
export const QUESTION_GAMES = {
  concepts: ['conceptDef', 'conceptTerm'],
  numbers: ['number'],
  practice: ['test', 'medGroup', 'medAction'],
  order: ['after', 'before', 'pair'],
  qa: ['qa'],
};
export const BLITZ_KINDS = Object.values(QUESTION_GAMES).flat();

/** The items a question kind is asked about, in the deck's order. */
function itemsOf(kind, bank) {
  switch (kind) {
    case 'conceptDef': return bank.concepts;
    case 'conceptTerm': return bank.concepts.filter((c) => c.def.length <= MAX_DEF_AS_OPTION);
    case 'number': return bank.numbers;
    case 'test': return bank.tests;
    case 'medGroup': return bank.meds.filter((m) => isText(m.group));
    case 'medAction': return bank.meds;
    case 'qa': return bank.cards.filter((c) => c.a.length <= MAX_ANSWER_AS_OPTION);
    case 'after': return bank.sequences.flatMap((s) => s.steps.slice(0, -1).map((_, i) => ({ seq: s, i, topic: s.topic })));
    case 'before': return bank.sequences.flatMap((s) => s.steps.slice(1).map((_, i) => ({ seq: s, i: i + 1, topic: s.topic })));
    case 'pair': return bank.pairs;
    default: throw new Error(`unknown question kind: ${kind}`);
  }
}

/** One question of `kind` about `item`; null when there are not enough fitting wrong answers. */
export function askAbout(kind, item, bank, rng) {
  switch (kind) {
    case 'conceptDef': return conceptQuestion(item, bank, rng, false);
    case 'conceptTerm': return conceptQuestion(item, bank, rng, true);
    case 'number': return numberQuestion(item, bank, rng);
    case 'test': return testQuestion(item, bank, rng);
    case 'medGroup': return medQuestion(item, bank, rng, true);
    case 'medAction': return medQuestion(item, bank, rng, false);
    case 'qa': return qaQuestion(item, bank, rng);
    case 'after': return sequenceQuestion(item.seq, item.i, true, bank, rng);
    case 'before': return sequenceQuestion(item.seq, item.i, false, bank, rng);
    case 'pair': return pairQuestion(item, bank, rng);
    default: throw new Error(`unknown question kind: ${kind}`);
  }
}

/**
 * A random question of one of `kinds`, about an item of the chosen `topics` (ids; null = all);
 * wrong answers come from the whole bank. Tries other items when one cannot be asked; null if none can.
 */
export function randomQuestion(bank, kinds, topics, rng = Math.random) {
  const wanted = topics ? new Set(topics) : null;
  for (const kind of shuffle(kinds, rng)) {
    const pool = itemsOf(kind, bank).filter((x) => wanted === null || wanted.has(x.topic));
    for (const item of shuffle(pool, rng).slice(0, 8)) {
      const q = askAbout(kind, item, bank, rng);
      if (q) return q;
    }
  }
  return null;
}

/** How many questions of `kinds` the chosen topics can fill (items, not all of them are askable). */
export function questionPool(bank, kinds, topics) {
  const wanted = topics ? new Set(topics) : null;
  return kinds.reduce((n, kind) => n + itemsOf(kind, bank).filter((x) => wanted === null || wanted.has(x.topic)).length, 0);
}

// ---------- the generated quiz ----------

/**
 * The multiple-choice quiz of a concept deck, in the quiz engine's format: topic = the deck's
 * topic title. Each question is seeded by its own id, so it is the same on every load.
 */
export function buildConceptQuiz(deck, { id, subject, unit } = {}) {
  if (!isValidQuizId(id)) throw new Error(`invalid quiz id: ${id}`);
  const bank = buildBank(deck);
  const questions = [];
  // "After A comes B" and "before B comes A" are one fact: the quiz asks the first, the games both.
  for (const kind of BLITZ_KINDS.filter((k) => k !== 'before')) {
    for (const item of itemsOf(kind, bank)) {
      // The id isn't known before the question is made, so seed from kind and item.
      const seed = `${kind}:${item.id ?? `${item.seq?.id}:${item.i}`}`;
      const q = askAbout(kind, item, bank, seededRng(seed));
      if (q) questions.push(q);
    }
  }
  const order = new Map(deck.topics.map((t, i) => [t.title, i]));
  questions.sort((a, b) => order.get(a.topic) - order.get(b.topic));
  return {
    id,
    subject,
    ...(unit ? { unit } : {}),
    title: 'מבחן מושגים',
    description: 'שאלות שנוצרות מהכרטיסיות: הגדרות, מספרים, בדיקות, תרופות, שאלות ותשובות, סדרים והתאמות. בחרו נושאים ומספר שאלות.',
    questions,
  };
}

// ---------- matching board ----------

export { MATCH_SIZE };
const MAX_PAIR_TEXT = 80;

/**
 * One round of the matching board: up to `size` pairs, either from one of the matching sets of the
 * chosen topics (`source` 'sets'), short concept/definition pairs (`source` 'concepts') or short
 * question/answer cards (`source` 'cards').
 * `weights` ({ [pair id]: number }, default 1) makes pairs missed before come up more often.
 * Returns { title, pairs: [{ id, a, b }] in a-order, bOrder: ids in shuffled order } or null.
 */
export function buildMatchRound(bank, { topics = null, source = 'sets', size = MATCH_SIZE, weights = {} } = {}, rng = Math.random) {
  const wanted = topics ? new Set(topics) : null;
  const inTopics = (x) => wanted === null || wanted.has(x.topic);
  // A board needs 2 or more pairs whose items and answers all differ, so a set whose items share
  // one answer is skipped (it still feeds the multiple-choice questions).
  const sources = source === 'sets'
    ? shuffle(bank.sets.filter(inTopics), rng).map((set) => ({
      title: set.title,
      candidates: bank.pairs.filter((p) => p.set === set.id),
    }))
    : source === 'cards'
      ? [{
        title: 'שאלות ותשובות',
        candidates: bank.cards.filter((c) => inTopics(c) && c.q.length <= MAX_PAIR_TEXT && c.a.length <= MAX_PAIR_TEXT)
          .map((c) => ({ id: c.id, a: c.q, b: c.a, topic: c.topic })),
      }]
      : [{
        title: 'מושגים והסבריהם',
        candidates: bank.concepts.filter((c) => inTopics(c) && c.def.length <= MAX_PAIR_TEXT)
          .map((c) => ({ id: c.id, a: c.term, b: c.def, topic: c.topic })),
      }];
  for (const { title, candidates } of sources) {
    const round = boardFrom(candidates, title, size, weights, rng);
    if (round) return round;
  }
  return null;
}

function boardFrom(candidates, title, size, weights, rng) {
  const picked = [];
  let pool = candidates;
  while (picked.length < size && pool.length > 0) {
    const weightOf = (p) => Math.max(1, weights[p.id] ?? 1);
    let r = rng() * pool.reduce((n, p) => n + weightOf(p), 0);
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= weightOf(pool[i]);
      if (r < 0) {
        index = i;
        break;
      }
    }
    const pair = pool[index];
    picked.push(pair);
    pool = pool.filter((p) => p !== pair && !overlaps(p.a, pair.a) && !overlaps(p.b, pair.b));
  }
  if (picked.length < 2) return null;
  const pairs = candidates.filter((p) => picked.includes(p)).map((p) => ({ id: p.id, a: p.a, b: p.b }));
  return { title, pairs, bOrder: shuffle(pairs.map((p) => p.id), rng) };
}
