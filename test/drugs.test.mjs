import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuiz } from '../js/core.js';
import {
  buildDrugQuiz,
  buildMatchRound,
  drugId,
  filterDrugs,
  overlaps,
  seededRng,
  textItems,
  updateMatchWeights,
  validateDrugDeck,
} from '../js/drugs-core.js';
import { drugDeckErrors } from '../scripts/drugs.mjs';
import { isSitePath, validateCatalog } from '../scripts/quizzes.mjs';

// Placeholder data only: families A and B, drugs named by letter, made-up texts.
const drug = (name, family, n, extra = {}) => ({
  name,
  family,
  receptor: `רצפטור ${n}`,
  mechanism: `מנגנון ${n}`,
  indications: `אינדיקציה ${n}`,
  sideEffects: `תופעה ${n}`,
  alsoIn: [],
  exam: false,
  ...extra,
});
const deck = {
  families: ['משפחה א', 'משפחה ב'],
  drugs: [
    drug('Alpha', 'משפחה א', 1, { exam: true }),
    drug('Beta', 'משפחה א', 2),
    drug('Gamma', 'משפחה א', 3, { sideEffects: '' }),
    drug('Delta', 'משפחה ב', 4, { alsoIn: ['משפחה א'] }),
    drug('Epsilon', 'משפחה ב', 5),
    drug('Zeta', 'משפחה ב', 6, { exam: true }),
  ],
};

test('validateDrugDeck accepts a good deck and names the problems of a bad one', () => {
  assert.deepEqual(validateDrugDeck(deck), []);
  assert.deepEqual(validateDrugDeck(null), ['drug deck must be a JSON object']);
  const bad = { families: ['משפחה א'], drugs: [
    { ...drug('Alpha', 'משפחה ג', 1), extra: 1 },
    { ...drug('Alpha', 'משפחה א', 2), alsoIn: ['אין כזו'], exam: 'yes', receptor: null },
  ] };
  const errors = validateDrugDeck(bad).join('\n');
  for (const part of ['family must be one of', 'unknown field "extra"', 'duplicate name', 'alsoIn', 'exam must be', 'receptor must be a string']) {
    assert.ok(errors.includes(part), part);
  }
});

test('drugId is stable and storage-safe; seededRng repeats per seed', () => {
  assert.equal(drugId({ name: 'Alpha' }), drugId({ name: 'Alpha' }));
  assert.notEqual(drugId({ name: 'Alpha' }), drugId({ name: 'Beta' }));
  assert.match(drugId({ name: 'Alpha' }), /^d[a-z0-9]+$/);
  const a = seededRng('x');
  const b = seededRng('x');
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.ok([seededRng('y')()].every((v) => v >= 0 && v < 1));
});

test('overlaps: equal texts or a shared item', () => {
  assert.deepEqual(textItems('טכיקרדיה, יובש פה; עצירות'), ['טכיקרדיה', 'יובש פה', 'עצירות']);
  assert.ok(overlaps('יתר ל"ד, אנגינה', 'אנגינה'));
  assert.ok(overlaps(' Same  text', 'same text'));
  assert.ok(!overlaps('יתר ל"ד', 'תת ל"ד'));
  assert.ok(overlaps('אנטגוניסט מוסקריני מרכזי', 'אנטגוניסט מוסקריני'));
  assert.ok(!overlaps('GI', 'GI bleeding, כאב'), 'short items only match when equal');
});

test('buildDrugQuiz makes valid, deterministic questions grouped by family', () => {
  const quiz = buildDrugQuiz(deck, { id: 'drugs-x', subject: 'מקצוע', unit: 'כרטיסיות' });
  assert.deepEqual(validateQuiz(quiz), []);
  assert.equal(quiz.unit, 'כרטיסיות');
  assert.deepEqual(quiz, buildDrugQuiz(deck, { id: 'drugs-x', subject: 'מקצוע', unit: 'כרטיסיות' }));
  // 6 drugs × (mechanism, indications, reverse) + 5 side effects (Gamma has none).
  assert.equal(quiz.questions.length, 6 * 3 + 5);
  const topics = quiz.questions.map((q) => q.topic);
  assert.equal(topics.lastIndexOf('משפחה א') < topics.indexOf('משפחה ב'), true);
  const q = quiz.questions.find((x) => x.id === `${drugId(deck.drugs[0])}-m`);
  assert.equal(q.options[q.correct].text, 'מנגנון 1');
  assert.ok(q.question.includes('Alpha'));
  assert.ok(q.explanation.startsWith('Alpha (משפחה א).'));
  // The wrong answers prefer the same family, and say whose they are.
  assert.ok(q.options.some((o) => o.note === 'זה המנגנון של Beta.'));
  const reverse = quiz.questions.find((x) => x.id === `${drugId(deck.drugs[0])}-n`);
  assert.equal(reverse.options[reverse.correct].text, 'Alpha');
  assert.ok(reverse.question.includes('מנגנון 1'));
});

test('buildDrugQuiz never offers an overlapping text as a wrong answer, and skips what it cannot fill', () => {
  const shared = {
    families: ['א'],
    drugs: [
      drug('A', 'א', 1, { indications: 'כאב, חום' }),
      drug('B', 'א', 2, { indications: 'חום' }),
      drug('C', 'א', 3),
      drug('D', 'א', 4),
      drug('E', 'א', 5),
    ],
  };
  const quiz = buildDrugQuiz(shared, { id: 'drugs-y', subject: 'x' });
  assert.deepEqual(validateQuiz(quiz), []);
  const a = quiz.questions.find((q) => q.id === `${drugId(shared.drugs[0])}-i`);
  assert.ok(a.options.every((o) => o.text !== 'חום'));
  // Too few drugs for 3 non-overlapping wrong answers: no question.
  const tiny = { families: ['א'], drugs: [drug('A', 'א', 1), drug('B', 'א', 2), drug('C', 'א', 3)] };
  assert.equal(buildDrugQuiz(tiny, { id: 'drugs-z', subject: 'x' }).questions.length, 0);
  assert.throws(() => buildDrugQuiz(deck, { id: 'Bad Id', subject: 'x' }));
});

test('buildDrugQuiz examOnly keeps the exam drugs, with wrong answers from the whole deck', () => {
  const quiz = buildDrugQuiz(deck, { id: 'drugs-x-exam', subject: 'x', examOnly: true });
  assert.deepEqual(validateQuiz(quiz), []);
  const ids = new Set([drugId(deck.drugs[0]), drugId(deck.drugs[5])]);
  assert.ok(quiz.questions.every((q) => ids.has(q.id.split('-')[0])));
  assert.equal(quiz.questions.length, 8);
});

test('filterDrugs by words in any field, family (with alsoIn) and exam', () => {
  const names = (list) => list.map((d) => d.name);
  assert.equal(filterDrugs(deck.drugs).length, 6);
  assert.deepEqual(names(filterDrugs(deck.drugs, { query: 'מנגנון 2' })), ['Beta']);
  assert.deepEqual(names(filterDrugs(deck.drugs, { query: 'alpha' })), ['Alpha']);
  assert.deepEqual(names(filterDrugs(deck.drugs, { family: 'משפחה א' })), ['Alpha', 'Beta', 'Gamma', 'Delta']);
  assert.deepEqual(names(filterDrugs(deck.drugs, { examOnly: true })), ['Alpha', 'Zeta']);
});

test('buildMatchRound picks distinct, matchable pairs and favours weighted drugs', () => {
  const round = buildMatchRound(deck.drugs, { field: 'sideEffects', size: 4 }, seededRng('r'));
  assert.equal(round.pairs.length, 4);
  assert.ok(round.pairs.every((p) => p.text !== ''));
  assert.deepEqual([...round.texts].sort(), round.pairs.map((p) => p.id).sort());
  const all = buildMatchRound(deck.drugs, { field: 'mechanism', size: 10 }, seededRng('r'));
  assert.equal(all.pairs.length, 6);
  assert.throws(() => buildMatchRound(deck.drugs, { field: 'name' }));
  // A heavily weighted drug comes up nearly always.
  const heavy = { [drugId(deck.drugs[4])]: 1000 };
  let hits = 0;
  for (let i = 0; i < 20; i++) {
    const r = buildMatchRound(deck.drugs, { field: 'mechanism', size: 1, weights: heavy }, seededRng(`s${i}`));
    if (r.pairs[0].name === 'Epsilon') hits += 1;
  }
  assert.ok(hits >= 19);
});

test('updateMatchWeights raises missed drugs and lets clean ones decay', () => {
  let w = updateMatchWeights({}, { a: true, b: false });
  assert.deepEqual(w, { a: 3 });
  w = updateMatchWeights(w, { a: true });
  assert.deepEqual(w, { a: 5 });
  w = updateMatchWeights({ a: 9 }, { a: true });
  assert.deepEqual(w, { a: 9 });
  w = updateMatchWeights({ a: 2 }, { a: false });
  assert.deepEqual(w, {});
});

test('catalog tools: title and a relative site page; drugDeckErrors checks the generated quiz', () => {
  assert.ok(isSitePath('drugs.html?subject=pharmacology'));
  for (const bad of ['https://x.com/a.html', '/drugs.html', '../a.html', 'drugs.html#x', 'drugs.js', '']) {
    assert.ok(!isSitePath(bad), bad);
  }
  const ok = { subjects: [{ id: 'a', name: 'א', tools: [{ title: 'כלי', href: 'drugs.html?subject=a' }] }] };
  assert.deepEqual(validateCatalog(ok), []);
  const bad = { subjects: [{ id: 'a', name: 'א', tools: [{ title: 'כלי', href: 'http://x' }] }] };
  assert.ok(validateCatalog(bad)[0].includes('tools'));
  assert.deepEqual(drugDeckErrors(deck, 'x'), []);
  assert.ok(drugDeckErrors({ families: [], drugs: [] }, 'x').length > 0);
});
