import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuiz } from '../js/core.js';
import {
  addDays,
  buildDrugQuiz,
  buildMatchRound,
  buildOddOneOut,
  buildStemQuestion,
  dailySet,
  dayKey,
  drugId,
  filterDrugs,
  flashcardSheets,
  gradeReview,
  overlaps,
  reviewStats,
  sanitizeFamilies,
  sanitizeReview,
  seededRng,
  stemWords,
  textItems,
  updateMatchWeights,
  validateDrugDeck,
  validateStems,
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

test('filterDrugs by a list of families (with alsoIn); empty list = none, null = all', () => {
  const names = (list) => list.map((d) => d.name);
  const [first, second] = deck.families;
  const one = filterDrugs(deck.drugs, { family: first });
  assert.deepEqual(filterDrugs(deck.drugs, { families: [first] }), one);
  const both = names(filterDrugs(deck.drugs, { families: [first, second] }));
  const either = new Set([...names(one), ...names(filterDrugs(deck.drugs, { family: second }))]);
  assert.deepEqual(both, deck.drugs.map((d) => d.name).filter((n) => either.has(n)));
  assert.deepEqual(filterDrugs(deck.drugs, { families: [] }), []);
  assert.equal(filterDrugs(deck.drugs, { families: null }).length, deck.drugs.length);
  assert.ok(filterDrugs(deck.drugs, { families: [first], examOnly: true }).every((d) => d.exam));
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

// ---------- suffixes, odd one out, daily review ----------

const nameDeck = {
  families: ['א', 'ב'],
  drugs: [
    drug('Fooolol', 'א', 1),
    drug('Barolol / Bazpril', 'א', 2),
    drug('Quxpril', 'ב', 3),
    drug('Somaxin', 'ב', 4),
    drug('Taxumab', 'ב', 5),
    drug('Lemixin', 'א', 6),
  ],
};
const stems = [
  { stem: '-olol', pattern: 'olol$', class: 'קבוצה 1' },
  { stem: '-pril', pattern: 'pril$', class: 'קבוצה 2' },
  { stem: '-xin', pattern: 'xin$', class: 'קבוצה 3', except: ['somaxin'] },
  { stem: '-mab', pattern: 'mab$', class: 'קבוצה 4' },
];

test('stemWords finds each Latin word a suffix explains, honouring except', () => {
  const words = stemWords(stems, nameDeck);
  assert.deepEqual(words.map((w) => w.word), ['Fooolol', 'Barolol', 'Bazpril', 'Quxpril', 'Taxumab', 'Lemixin']);
  assert.equal(words.find((w) => w.word === 'Bazpril').drug, 'Barolol / Bazpril');
  assert.deepEqual(validateStems({ stems }, nameDeck), []);
  assert.ok(validateStems({ stems: [...stems, { stem: '-zz', pattern: 'zz$', class: 'קבוצה 5' }] }, nameDeck)
    .some((e) => e.includes('matches no drug')));
  assert.ok(validateStems({ stems: [...stems, { stem: '-x', pattern: '(', class: 'ק' }] }, nameDeck)
    .some((e) => e.includes('regular expression')));
  assert.ok(validateStems({ stems: stems.slice(0, 2) }, nameDeck)[0].includes('at least'));
});

test('buildStemQuestion: forward asks the class, reverse asks the name, one right option', () => {
  const words = stemWords(stems, nameDeck);
  for (let i = 0; i < 20; i++) {
    const f = buildStemQuestion(stems, words, {}, seededRng(`f${i}`));
    assert.equal(f.options.length, 4);
    assert.equal(new Set(f.options).size, 4);
    assert.equal(f.options[f.correct], stems[f.stem].class);
    assert.equal(f.prompt, f.word);
    const r = buildStemQuestion(stems, words, { reverse: true }, seededRng(`r${i}`));
    assert.equal(r.options[r.correct], r.word);
    assert.equal(r.prompt, stems[r.stem].class);
    // The other names come from other suffixes.
    const stemOf = new Map(words.map((w) => [w.word, w.stem]));
    assert.ok(r.options.every((o, j) => j === r.correct || stemOf.get(o) !== r.stem));
  }
});

test('buildOddOneOut: three from one family, one from another, never an alsoIn of it', () => {
  for (let i = 0; i < 20; i++) {
    const round = buildOddOneOut(deck.drugs, seededRng(`o${i}`));
    assert.equal(round.drugs.length, 4);
    const odd = round.drugs[round.odd];
    assert.notEqual(odd.family, round.family);
    assert.ok(!odd.alsoIn.includes(round.family));
    assert.equal(round.drugs.filter((d) => d.family === round.family).length, 3);
  }
  assert.equal(buildOddOneOut(deck.drugs.slice(0, 2)), null);
});

test('daily review: due first, then new; grading moves boxes; nothing twice a day', () => {
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  const today = '2026-03-10';
  const [a, b, c] = deck.drugs;
  let review = {};
  review = gradeReview(review, drugId(a), true, '2026-03-08'); // box 1, due 03-09
  review = gradeReview(review, drugId(b), true, today); // reviewed today
  assert.deepEqual(review[drugId(a)], { box: 1, due: '2026-03-09', last: '2026-03-08' });
  const set = dailySet(deck.drugs, review, today, { size: 3 });
  assert.equal(set[0], a);
  assert.ok(!set.includes(b));
  assert.equal(set.length, 3);
  // Known again → box 2 (2 days); unknown → back to box 1 (tomorrow).
  assert.deepEqual(gradeReview(review, drugId(a), true, today)[drugId(a)], { box: 2, due: '2026-03-12', last: today });
  assert.equal(gradeReview({ x: { box: 5, due: today, last: today } }, 'x', true, today).x.box, 5);
  assert.deepEqual(gradeReview(review, drugId(a), false, today)[drugId(a)], { box: 1, due: '2026-03-11', last: today });
  // New drugs missed in the matching game come first.
  const weighted = dailySet(deck.drugs, {}, today, { size: 1, weights: { [drugId(c)]: 9 } });
  assert.deepEqual(weighted, [c]);
  assert.deepEqual(dailySet(deck.drugs, {}, today), dailySet(deck.drugs, {}, today));
  const stats = reviewStats(deck.drugs, { ...review, [drugId(c)]: { box: 4, due: '2026-04-01', last: today } }, today);
  assert.deepEqual(stats, { fresh: 3, learning: 2, mastered: 1, due: 1 });
});

test('sanitizeFamilies keeps chosen families still in the deck, else all', () => {
  const families = ['א', 'ב', 'ג'];
  assert.deepEqual(sanitizeFamilies(null, families), families);
  assert.deepEqual(sanitizeFamilies('א', families), families);
  assert.deepEqual(sanitizeFamilies(['ג', 'א', 'gone'], families), ['א', 'ג']);
  assert.deepEqual(sanitizeFamilies([], families), []);
  assert.deepEqual(sanitizeFamilies(['gone'], families), families);
});

test('sanitizeReview keeps only well-formed entries', () => {
  assert.deepEqual(sanitizeReview(null), {});
  assert.deepEqual(sanitizeReview({
    ok: { box: 2, due: '2026-01-01', last: '2025-12-30' },
    badBox: { box: 9, due: '2026-01-01', last: '2025-12-30' },
    badDay: { box: 1, due: 'tomorrow', last: '2025-12-30' },
    notObj: 3,
  }), { ok: { box: 2, due: '2026-01-01', last: '2025-12-30' } });
});

test('flashcardSheets: 8 slots per sheet, back rows mirrored, last sheet padded', () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  const sheets = flashcardSheets(items);
  assert.equal(sheets.length, 2);
  assert.deepEqual(sheets[0].front, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(sheets[0].back, [1, 0, 3, 2, 5, 4, 7, 6]);
  assert.deepEqual(sheets[1].front, [8, 9, null, null, null, null, null, null]);
  assert.deepEqual(sheets[1].back, [9, 8, null, null, null, null, null, null]);
});

test('flashcardSheets: an odd slot count per row still lines up, empty input gives no sheets', () => {
  const [sheet] = flashcardSheets(['a', 'b', 'c', 'd', 'e'], { cols: 3, rows: 2 });
  assert.deepEqual(sheet.back, ['c', 'b', 'a', null, 'e', 'd']);
  assert.deepEqual(flashcardSheets([]), []);
});
