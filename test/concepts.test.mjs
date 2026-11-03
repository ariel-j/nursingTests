import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuiz } from '../js/core.js';
import {
  BLITZ_KINDS,
  QUESTION_GAMES,
  askAbout,
  buildBank,
  buildBrowse,
  buildCards,
  buildConceptQuiz,
  buildMatchRound,
  cardReviewStats,
  conceptsUrl,
  dailyCards,
  filterCards,
  gradeReview,
  randomQuestion,
  sanitizeTopics,
  validateConceptDeck,
} from '../js/concepts-core.js';
import { UNIT_BY_TOPIC, buildConceptDeck, conceptDeckErrors } from '../scripts/concepts.mjs';
import { readFile } from 'node:fs/promises';

// Placeholder data only: made-up words, no course content.
const WORDS = ['אלף', 'בית', 'גימל', 'דלת', 'הא', 'וו'];
function topic(id, title) {
  return {
    id,
    title,
    unit: `יחידה ${id}`,
    concepts: WORDS.map((w, i) => ({ id: `${id}-c${i + 1}`, term: `מושג ${w} ${id}`, def: `הסבר של ${w} באזור ${id}` })),
    numbers: WORDS.map((w, i) => ({ id: `${id}-n${i + 1}`, q: `ערך ${w} ${id}`, a: `${i + 2}-${i + 7} מ״מ` })),
    tests: WORDS.map((w, i) => ({
      id: `${id}-t${i + 1}`,
      name: `בדיקת ${w} ${id}`,
      purpose: `מטרה ייחודית של ${w} ${id}.`,
      ...(i === 0 ? {} : { nursing: `פעולת אחות ${w}` }),
    })),
    medications: WORDS.map((w, i) => ({
      id: `${id}-m${i + 1}`,
      name: `תרופה ${w} ${id}`,
      group: `קבוצת ${w} ${id}`,
      action: `פעולה של ${w} ${id}`,
    })),
    sequences: [{ id: `${id}-s1`, title: `סדר ${id}`, steps: WORDS.slice(0, 4).map((w) => `שלב ${w} ${id}`) }],
    matches: [{ id: `${id}-p1`, title: `זוגות ${id}`, pairs: WORDS.map((w) => ({ a: `פריט ${w} ${id}`, b: `תשובה ${w} ${id}` })) }],
  };
}
const clean = (t) => t;
const deck = { topics: [clean(topic('x', 'נושא א')), clean(topic('y', 'נושא ב'))] };
const rngOf = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

test('a well-formed deck validates, the url is per subject', () => {
  assert.deepEqual(validateConceptDeck(deck), []);
  assert.equal(conceptsUrl('a b'), 'data/a%20b/concepts.json');
});

test('validateConceptDeck reports structure problems', () => {
  assert.ok(validateConceptDeck(null)[0].includes('JSON object'));
  assert.ok(validateConceptDeck({ topics: [] })[0].includes('topics'));
  const bad = clean(topic('x', 'א'));
  bad.concepts[1].id = bad.concepts[0].id;
  bad.numbers[0].a = '';
  bad.sequences[0].steps = ['יחיד'];
  bad.matches[0].pairs[1].a = bad.matches[0].pairs[0].a;
  bad.tests[1].surprise = 'x';
  const errors = validateConceptDeck({ topics: [bad] });
  for (const part of ['duplicate id', 'a must be a non-empty', 'steps must be 2', '"a" sides must differ', 'unknown field "surprise"']) {
    assert.ok(errors.some((e) => e.includes(part)), part);
  }
});

test('optional fields may be empty, shared answers are allowed in a matching set', () => {
  const t = clean(topic('x', 'א'));
  t.tests[0].nursing = '';
  t.tests[0].normal = '';
  t.matches[0].pairs.forEach((p) => { p.b = 'אותה תשובה'; });
  assert.deepEqual(validateConceptDeck({ topics: [t] }), []);
});

test('buildCards flattens the four card kinds with their rows', () => {
  const cards = buildCards(deck);
  assert.equal(cards.length, 2 * 4 * 6);
  const concept = cards.find((c) => c.id === 'x-c1');
  assert.deepEqual([concept.kind, concept.topic, concept.topicTitle, concept.front], ['concept', 'x', 'נושא א', 'מושג אלף x']);
  assert.deepEqual(concept.rows, [{ label: 'הסבר', text: 'הסבר של אלף באזור x' }]);
  // A test without a nursing note or normal values has only its purpose.
  assert.deepEqual(cards.find((c) => c.id === 'x-t1').rows.map((r) => r.label), ['מטרה']);
  assert.deepEqual(cards.find((c) => c.id === 'x-t2').rows.map((r) => r.label), ['מטרה', 'תפקיד האחות']);
});

test('filterCards matches every word, kind and topics', () => {
  const cards = buildCards(deck);
  assert.equal(filterCards(cards, { kind: 'number' }).length, 12);
  assert.equal(filterCards(cards, { topics: ['y'] }).length, 24);
  assert.deepEqual(filterCards(cards, { query: 'גימל x', kind: 'concept' }).map((c) => c.id), ['x-c3']);
  assert.equal(filterCards(cards, { query: 'לא קיים' }).length, 0);
  assert.equal(filterCards(cards, { topics: [] }).length, 0);
});

test('buildBrowse groups by topic and includes sequences and matching sets', () => {
  const cards = buildCards(deck);
  const all = buildBrowse(deck, cards);
  assert.deepEqual(all.map((g) => g.topic.id), ['x', 'y']);
  assert.equal(all[0].items.length, 24 + 1 + 1);
  assert.deepEqual(buildBrowse(deck, cards, { kind: 'sequence' }).map((g) => g.items.length), [1, 1]);
  assert.deepEqual(buildBrowse(deck, cards, { kind: 'match', topics: ['y'] })[0].items[0].set.id, 'y-p1');
  // A query narrows cards, sequences and sets alike; empty topics are dropped.
  const found = buildBrowse(deck, cards, { query: 'שלב גימל y' });
  assert.deepEqual(found.map((g) => g.topic.id), ['y']);
  assert.equal(found[0].items[0].type, 'sequence');
  assert.deepEqual(buildBrowse(deck, cards, { query: 'לא קיים' }), []);
  assert.deepEqual(buildBrowse(deck, cards, { kind: 'number', topics: ['x'] })[0].items.map((i) => i.type), Array(6).fill('card'));
});

test('sanitizeTopics keeps known topics in deck order, malformed means all', () => {
  assert.deepEqual(sanitizeTopics(['y', 'x', 'gone'], ['x', 'y']), ['x', 'y']);
  assert.deepEqual(sanitizeTopics(['y'], ['x', 'y']), ['y']);
  assert.deepEqual(sanitizeTopics('x', ['x', 'y']), ['x', 'y']);
  assert.deepEqual(sanitizeTopics(['gone'], ['x', 'y']), ['x', 'y']);
  assert.deepEqual(sanitizeTopics([], ['x', 'y']), []);
});

test('dailyCards: due first (oldest first), then new, none already done today', () => {
  const cards = buildCards(deck).filter((c) => c.kind === 'concept');
  let review = {};
  review = gradeReview(review, 'x-c1', true, '2026-01-01'); // due 2026-01-02
  review = gradeReview(review, 'x-c2', false, '2025-12-30'); // due 2025-12-31
  review = gradeReview(review, 'x-c3', true, '2026-01-10'); // done today
  const set = dailyCards(cards, review, '2026-01-10', { size: 5 });
  assert.deepEqual(set.slice(0, 2).map((c) => c.id), ['x-c2', 'x-c1']);
  assert.ok(!set.some((c) => c.id === 'x-c3'));
  assert.equal(set.length, 5);
  assert.deepEqual(set, dailyCards(cards, review, '2026-01-10', { size: 5 })); // same day, same set
  const stats = cardReviewStats(cards, review, '2026-01-10');
  assert.deepEqual(stats, { fresh: 9, learning: 3, mastered: 0, due: 2 });
});

test('weights bring missed cards forward among the new ones', () => {
  const cards = buildCards(deck).filter((c) => c.kind === 'concept');
  const set = dailyCards(cards, {}, '2026-01-10', { size: 2, weights: { 'y-c6': 5 } });
  assert.equal(set[0].id, 'y-c6');
});

test('every question kind: right answer first, four different options, explanation', () => {
  const bank = buildBank(deck);
  for (const kind of BLITZ_KINDS) {
    const pool = randomQuestion(bank, [kind], null, rngOf(3));
    assert.ok(pool, kind);
    assert.equal(pool.options.length, 4, kind);
    assert.equal(new Set(pool.options.map((o) => o.text)).size, 4, kind);
    assert.equal(pool.correct, 0);
    assert.ok(pool.explanation.length > 0 && pool.question.length > 0 && pool.topic.length > 0, kind);
    for (const wrong of pool.options.slice(1)) assert.ok(wrong.note, `${kind}: wrong answers explain themselves`);
  }
});

test('questions are asked only about the chosen topics, wrong answers come from the whole bank', () => {
  const bank = buildBank(deck);
  for (let i = 0; i < 20; i++) {
    const q = randomQuestion(bank, QUESTION_GAMES.concepts, ['y'], rngOf(i + 1));
    assert.equal(q.topic, 'נושא ב');
  }
  assert.equal(randomQuestion(bank, QUESTION_GAMES.concepts, [], rngOf(1)), null);
  // Too few concepts overall: no question.
  const tiny = buildBank({ topics: [{ id: 'z', title: 'ז', concepts: deck.topics[0].concepts.slice(0, 3) }] });
  assert.equal(randomQuestion(tiny, ['conceptDef'], null, rngOf(1)), null);
});

test('number questions prefer answers of the same shape', () => {
  const t = { id: 'n', title: 'מספרים', numbers: [
    { id: 'n-1', q: 'עובי א', a: '1-2 מ״מ' },
    { id: 'n-2', q: 'עובי ב', a: '3-4 מ״מ' },
    { id: 'n-3', q: 'עובי ג', a: '5-6 מ״מ' },
    { id: 'n-4', q: 'עובי ד', a: '7-8 מ״מ' },
    { id: 'n-5', q: 'מספר ה', a: '9' },
    { id: 'n-6', q: 'מספר ו', a: '10 ימים' },
  ] };
  const bank = buildBank({ topics: [t] });
  const q = askAbout('number', bank.numbers[0], bank, rngOf(2));
  assert.deepEqual(q.options.slice(1).map((o) => o.text).sort(), ['3-4 מ״מ', '5-6 מ״מ', '7-8 מ״מ']);
  assert.equal(q.question, 'עובי א: מה הערך?');
  const asked = askAbout('number', { id: 'n-7', q: 'תוך כמה שעות מקבלה', a: '12 שעות', topic: 'n', topicTitle: 'מספרים' }, bank, rngOf(2));
  assert.equal(asked.question, 'תוך כמה שעות מקבלה?');
});

test('sequence questions: the next or previous step, wrong answers from the same sequence first', () => {
  const bank = buildBank(deck);
  const seq = bank.sequences[0];
  const after = askAbout('after', { seq, i: 1, topic: seq.topic }, bank, rngOf(4));
  assert.equal(after.options[0].text, seq.steps[2]);
  assert.ok(after.question.includes(seq.steps[1]));
  const before = askAbout('before', { seq, i: 2, topic: seq.topic }, bank, rngOf(4));
  assert.equal(before.options[0].text, seq.steps[1]);
  assert.equal(askAbout('after', { seq, i: seq.steps.length - 1, topic: seq.topic }, bank, rngOf(4)), null);
  // The step asked about is never one of the answers.
  assert.ok(!after.options.some((o) => o.text === seq.steps[1]));
});

test('pair questions use the other items of the same set as wrong answers', () => {
  const bank = buildBank(deck);
  const q = askAbout('pair', bank.pairs[0], bank, rngOf(5));
  assert.equal(q.options[0].text, 'תשובה אלף x');
  assert.ok(q.options.slice(1).every((o) => o.text.endsWith(' x')));
});

test('the generated quiz is valid, deterministic, in topic order and has unique ids', () => {
  const quiz = buildConceptQuiz(deck, { id: 'concepts-test', subject: 'מקצוע', unit: 'כרטיסיות' });
  assert.deepEqual(validateQuiz(quiz), []);
  assert.deepEqual(quiz, buildConceptQuiz(deck, { id: 'concepts-test', subject: 'מקצוע', unit: 'כרטיסיות' }));
  assert.equal(new Set(quiz.questions.map((q) => q.id)).size, quiz.questions.length);
  const titles = quiz.questions.map((q) => q.topic);
  assert.equal(titles.indexOf('נושא ב'), titles.lastIndexOf('נושא א') + 1);
  // "after" yes, "before" no: the same fact is not asked twice.
  assert.ok(quiz.questions.some((q) => q.id.endsWith('a')));
  assert.ok(!quiz.questions.some((q) => /-\d+b$/.test(q.id)));
  assert.throws(() => buildConceptQuiz(deck, { id: 'Bad Id', subject: 'x' }), /invalid quiz id/);
});

test('buildMatchRound: distinct pairs, at most the size, answers shuffled, weights bring missed pairs in', () => {
  const bank = buildBank(deck);
  const round = buildMatchRound(bank, { size: 4 }, rngOf(6));
  assert.equal(round.pairs.length, 4);
  assert.deepEqual([...round.bOrder].sort(), round.pairs.map((p) => p.id).sort());
  assert.equal(new Set(round.pairs.map((p) => p.b)).size, 4);
  const heavy = buildMatchRound(bank, { size: 1, weights: { 'x-p1-3': 1e9 }, topics: ['x'] }, rngOf(6));
  assert.equal(heavy, null); // one pair is not a board
  const two = buildMatchRound(bank, { size: 2, weights: { 'x-p1-3': 1e9 }, topics: ['x'] }, rngOf(6));
  assert.ok(two.pairs.some((p) => p.id === 'x-p1-3'));
  assert.equal(buildMatchRound(bank, { topics: [] }, rngOf(6)), null);
});

test('buildMatchRound skips a set whose items share one answer', () => {
  const same = { id: 's', title: 'ס', matches: [{ id: 's-p1', title: 'כולם אותו דבר', pairs: [{ a: 'א', b: 'ו' }, { a: 'ב', b: 'ו' }, { a: 'ג', b: 'ו' }] }] };
  assert.equal(buildMatchRound(buildBank({ topics: [same] }), {}, rngOf(1)), null);
  const mixed = { topics: [same, clean(topic('y', 'ב'))] };
  for (let i = 1; i < 15; i++) assert.notEqual(buildMatchRound(buildBank(mixed), {}, rngOf(i)).title, 'כולם אותו דבר');
});

test('the concept board takes short definitions only', () => {
  const t = clean(topic('x', 'א'));
  t.concepts[0].def = 'ארוך '.repeat(30);
  const round = buildMatchRound(buildBank({ topics: [t] }), { source: 'concepts', size: 6 }, rngOf(7));
  assert.ok(round.pairs.length >= 2 && round.pairs.every((p) => p.b.length <= 80));
});

test('buildConceptDeck publishes learning content only, mapped to units', () => {
  const source = {
    schema: 'x/1', course: 'שם הקורס', notes: 'הערה',
    topics: [
      { id: 'hygiene', order: 2, title: 'ב', source: 'מצגת פלונית', concepts: [{ id: 'h-c1', term: 'א', def: 'ב' }], tests: [], extra: 1 },
      { id: 'laws', order: 1, title: 'א', source: 'עוד', numbers: [{ id: 'l-n1', q: 'ש', a: 'ת' }] },
    ],
  };
  const published = buildConceptDeck(source);
  assert.deepEqual(published.topics.map((t) => t.id), ['laws', 'hygiene']); // by order
  assert.equal(published.topics[1].unit, UNIT_BY_TOPIC.hygiene);
  const text = JSON.stringify(published);
  for (const gone of ['source', 'course', 'notes', 'schema', 'extra', 'tests', 'מצגת פלונית', 'שם הקורס']) assert.ok(!text.includes(gone), gone);
  assert.throws(() => buildConceptDeck({}), /topics/);
});

test('conceptDeckErrors checks the unit against the subject and the generated quiz', () => {
  const subject = { id: 's', name: 'מקצוע', units: ['יחידה x', 'יחידה y'] };
  assert.deepEqual(conceptDeckErrors(deck, subject), []);
  assert.ok(conceptDeckErrors(deck, { ...subject, units: ['יחידה x'] })[0].includes('not a unit'));
  assert.ok(conceptDeckErrors({ topics: [] }, subject)[0].includes('topics'));
});

test('the published deck is valid, matches the catalog and carries no sources', async () => {
  const catalog = JSON.parse(await readFile(new URL('../quizzes/subjects.json', import.meta.url), 'utf8'));
  const raw = await readFile(new URL('../data/nursing-fundamentals/concepts.json', import.meta.url), 'utf8');
  const published = JSON.parse(raw);
  assert.deepEqual(conceptDeckErrors(published, catalog.subjects.find((s) => s.id === 'nursing-fundamentals')), []);
  assert.ok(!/"source"|Kozier|מצגת הקורס/.test(raw));
});
