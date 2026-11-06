import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BACK, MAX_FRONT, cardIdsForTopics, createCardSession, currentCard, isCardSessionCompatible, isComplete,
  listCardTopics, progressInfo, rate, recordResult, summarizeDeck, validateDeck,
} from '../js/cards-core.js';
import { MASTERY_STREAK, REQUEUE_MAX, REQUEUE_MIN } from '../js/core.js';

const deck = (n = 8, extra = {}) => ({
  id: 'sample-deck', subject: 'נושא לבדיקות', title: 'חפיסה לדוגמה',
  cards: Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, front: `חזית מדומה ${i + 1}`, back: `גב מדומה ${i + 1}`, topic: i % 2 ? 'נושא ב' : 'נושא א' })),
  ...extra,
});
const rngOf = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('validateDeck accepts a good deck and rejects structural problems', () => {
  assert.deepEqual(validateDeck(deck()), []);
  assert.ok(validateDeck(null).length > 0);
  assert.ok(validateDeck({ ...deck(), extra: 1 }).some((e) => /unknown field "extra"/.test(e)));
  assert.ok(validateDeck({ ...deck(), id: 'Bad_Id' }).some((e) => /deck\.id/.test(e)));
  assert.ok(validateDeck({ ...deck(), subject: '' }).some((e) => /subject/.test(e)));
  assert.ok(validateDeck({ ...deck(), cards: [] }).some((e) => /non-empty array/.test(e)));
  assert.ok(validateDeck({ ...deck(), unit: '' }).some((e) => /unit/.test(e)));
  assert.ok(validateDeck({ ...deck(), description: 5 }).some((e) => /description/.test(e)));
});

test('validateDeck checks each card: ids, text, caps, topic, unknown keys', () => {
  const withCard = (card) => validateDeck({ ...deck(), cards: [{ id: 'c1', front: 'א', back: 'ב', ...card }] });
  assert.deepEqual(withCard({}), []);
  assert.ok(withCard({ id: '' }).some((e) => /id must/.test(e)));
  assert.ok(withCard({ front: ' ' }).some((e) => /front/.test(e)));
  assert.ok(withCard({ back: 3 }).some((e) => /back/.test(e)));
  assert.ok(withCard({ front: 'x'.repeat(MAX_FRONT + 1) }).some((e) => /front is longer/.test(e)));
  assert.ok(withCard({ back: 'x'.repeat(MAX_BACK + 1) }).some((e) => /back is longer/.test(e)));
  assert.deepEqual(withCard({ front: 'x'.repeat(MAX_FRONT) }), []);
  assert.ok(withCard({ topic: '' }).some((e) => /topic/.test(e)));
  assert.ok(withCard({ topic: 'x'.repeat(101) }).some((e) => /topic is longer/.test(e)));
  assert.ok(withCard({ hint: 'x' }).some((e) => /unknown field "hint"/.test(e)));
  const dup = validateDeck({ ...deck(), cards: [{ id: 'c1', front: 'א', back: 'ב' }, { id: 'c1', front: 'ג', back: 'ד' }] });
  assert.ok(dup.some((e) => /duplicate card id/.test(e)));
  assert.ok(validateDeck({ ...deck(), cards: ['x'] }).some((e) => /must be an object/.test(e)));
});

test('topics: listed in order, cards without a topic grouped under the default', () => {
  const d = deck(4);
  assert.deepEqual(listCardTopics(d), [{ topic: 'נושא א', count: 2 }, { topic: 'נושא ב', count: 2 }]);
  assert.deepEqual(cardIdsForTopics(d, ['נושא ב']), ['c2', 'c4']);
  const none = { ...d, cards: [{ id: 'a', front: 'x', back: 'y' }] };
  assert.deepEqual(listCardTopics(none), [{ topic: 'כללי', count: 1 }]);
  assert.deepEqual(cardIdsForTopics(none, ['כללי']), ['a']);
});

test('a session queues every card once; modes and subsets work; empty is refused', () => {
  const d = deck();
  const s = createCardSession(d, rngOf(0.3, 0.7));
  assert.equal(s.deckId, 'sample-deck');
  assert.ok(!('quizId' in s));
  assert.deepEqual([...s.queue].sort(), d.cards.map((c) => c.id).sort());
  assert.equal(s.mode, 'full');
  const sub = createCardSession(d, Math.random, { cardIds: ['c1', 'c3', 'nope'], mode: 'topics' });
  assert.deepEqual([...sub.queue].sort(), ['c1', 'c3']);
  assert.throws(() => createCardSession(d, Math.random, { cardIds: [] }), /at least one/);
  assert.throws(() => createCardSession(d, Math.random, { mode: 'bogus' }), /unknown session mode/);
});

test('known on the first try masters a card and does not requeue it', () => {
  const d = deck(3);
  let s = createCardSession(d, () => 0.5);
  const first = s.queue[0];
  const r = rate(s, d, true);
  assert.equal(r.card.id, first);
  assert.equal(r.known, true);
  assert.equal(r.progress.mastered, true);
  assert.equal(r.state.queue.length, 2);
  assert.ok(!r.state.queue.includes(first));
  assert.equal(r.state.progress[first].firstTry, 'correct');
  assert.equal(s.queue.length, 3, 'the old state is not mutated');
});

test('not known requeues the card 2-5 positions later, never next unless it is the last', () => {
  const d = deck(10);
  const s = createCardSession(d, () => 0.5);
  const id = s.queue[0];
  for (const [rng, offset] of [[0, REQUEUE_MIN], [0.99, REQUEUE_MAX]]) {
    const r = rate(s, d, false, () => rng);
    assert.equal(r.state.queue.indexOf(id), offset - 1, `offset ${offset}`);
    assert.equal(r.state.progress[id].misses, 1);
    assert.equal(r.state.progress[id].mastered, false);
  }
  const lone = createCardSession(deck(1), () => 0.5);
  assert.deepEqual(rate(lone, deck(1), false).state.queue, ['c1'], 'last card comes straight back');
});

test(`after a miss a card needs ${MASTERY_STREAK} knowns in a row`, () => {
  const d = deck(1);
  let s = createCardSession(d);
  s = rate(s, d, false).state;
  s = rate(s, d, true).state;
  assert.equal(isComplete(s), false);
  assert.equal(s.progress.c1.mastered, false);
  s = rate(s, d, false).state;
  assert.equal(s.progress.c1.streak, 0, 'a miss resets the streak');
  s = rate(s, d, true).state;
  s = rate(s, d, true).state;
  assert.equal(s.progress.c1.mastered, true);
  assert.equal(isComplete(s), true);
  assert.throws(() => rate(s, d, true), /already complete/);
  assert.equal(currentCard(s, d), null);
});

test('progressInfo counts mastered and queued cards', () => {
  const d = deck(3);
  let s = createCardSession(d, () => 0.5);
  s = rate(s, d, true).state;
  s = rate(s, d, false).state;
  assert.deepEqual(progressInfo(s), { mastered: 1, total: 3, queueSize: 2 });
});

test('a saved session is compatible only while it matches the deck', () => {
  const d = deck();
  const s = createCardSession(d);
  assert.equal(isCardSessionCompatible(s, d), true);
  assert.equal(isCardSessionCompatible(JSON.parse(JSON.stringify(rate(s, d, true).state)), d), true, 'survives a JSON round trip');
  assert.equal(isCardSessionCompatible(s, { ...d, id: 'other' }), false);
  assert.equal(isCardSessionCompatible(s, { ...d, cards: d.cards.slice(1) }), false, 'a card was removed');
  assert.equal(isCardSessionCompatible(s, { ...d, cards: [...d.cards, { id: 'new', front: 'x', back: 'y' }] }), false, 'a full session no longer covers the deck');
  assert.equal(isCardSessionCompatible({ ...s, version: 99 }, d), false);
  assert.equal(isCardSessionCompatible({ ...s, queue: [...s.queue, s.queue[0]] }, d), false);
  assert.equal(isCardSessionCompatible(null, d), false);
  assert.equal(isCardSessionCompatible('x', d), false);
  const { deckId, ...noId } = s;
  assert.equal(isCardSessionCompatible(noId, d), false);
  void deckId;
});

test('summary: first-try percent, struggled cards, weak topics; feeds recordResult', () => {
  const d = deck(4); // c1,c3 = נושא א ; c2,c4 = נושא ב
  let s = createCardSession(d, () => 0.5, {});
  s = { ...s, queue: ['c1', 'c2', 'c3', 'c4'] };
  s = rate(s, d, true, () => 0).state;  // c1 known
  s = rate(s, d, false, () => 0).state; // c2 missed
  const sum = summarizeDeck(s, d);
  assert.equal(sum.total, 4);
  assert.equal(sum.firstTryCorrect, 1);
  assert.equal(sum.firstTryPercent, 25);
  assert.deepEqual(sum.retried.map((r) => [r.id, r.misses, r.front]), [['c2', 1, 'חזית מדומה 2']]);
  assert.deepEqual(sum.weakTopics, [{ topic: 'נושא ב', total: 2, missed: 1, rate: 0.5 }]);
  const history = recordResult(null, sum, '2026-11-06');
  assert.equal(history.attempts, 1);
  assert.equal(history.bestPercent, 25);
  assert.equal(summarizeDeck(createCardSession(d, Math.random, { cardIds: ['c1'], mode: 'retry' }), d).total, 1, 'only the session cards count');
});

test('retry mode: only the cards that came back last time', () => {
  const d = deck(4);
  let s = { ...createCardSession(d), queue: ['c1', 'c2', 'c3', 'c4'] };
  s = rate(s, d, false, () => 0).state;
  const struggled = summarizeDeck(s, d).retried.map((r) => r.id);
  const retry = createCardSession(d, Math.random, { cardIds: struggled, mode: 'retry' });
  assert.deepEqual(retry.queue, ['c1']);
  assert.equal(retry.mode, 'retry');
});
