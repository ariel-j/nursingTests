// Pure flashcard logic: deck validation, study session, summary. No DOM, no storage.
// A deck is studied with the quiz engine's rules (core.js): "ידעתי" on the first try masters a card;
// after a miss it comes back 2-5 cards later and needs MASTERY_STREAK knowns in a row. The session
// helpers adapt a deck to the quiz shape so createSession / isSessionCompatible / advance are shared.
import {
  advance,
  createSession,
  isComplete,
  isPlainObject,
  isSessionCompatible,
  isText,
  isValidQuizId,
  progressInfo,
  recordResult,
  unknownKeys,
} from './core.js';

export { isComplete, progressInfo, recordResult };

export const MAX_FRONT = 500;
export const MAX_BACK = 2000;
export const MAX_TOPIC = 100;
// Cards without a topic are grouped under this label when practising by topic.
export const DEFAULT_TOPIC = 'כללי';

const DECK_KEYS = new Set(['id', 'subject', 'unit', 'title', 'description', 'cards']);
const CARD_KEYS = new Set(['id', 'front', 'back', 'topic']);

export const topicOf = (card) => card.topic ?? DEFAULT_TOPIC;

/** Human-readable problems; an empty list means the deck is valid. */
export function validateDeck(deck) {
  const errors = [];
  if (!isPlainObject(deck)) return ['deck must be a JSON object'];

  unknownKeys(deck, DECK_KEYS, 'deck', errors);
  if (!isValidQuizId(deck.id)) errors.push('deck.id must be lowercase letters, digits and single hyphens');
  if (!isText(deck.subject)) errors.push('deck.subject must be a non-empty string');
  if (deck.unit !== undefined && !isText(deck.unit)) errors.push('deck.unit must be a non-empty string');
  if (!isText(deck.title)) errors.push('deck.title must be a non-empty string');
  if (deck.description !== undefined && typeof deck.description !== 'string') {
    errors.push('deck.description must be a string');
  }
  if (!Array.isArray(deck.cards) || deck.cards.length === 0) {
    errors.push('deck.cards must be a non-empty array');
    return errors;
  }

  const seen = new Set();
  deck.cards.forEach((c, i) => {
    const where = `cards[${i}]${isPlainObject(c) && isText(c.id) ? ` (${c.id})` : ''}`;
    if (!isPlainObject(c)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    unknownKeys(c, CARD_KEYS, where, errors);
    if (!isText(c.id)) errors.push(`${where}: id must be a non-empty string`);
    else if (seen.has(c.id)) errors.push(`${where}: duplicate card id`);
    else seen.add(c.id);

    if (!isText(c.front)) errors.push(`${where}: front must be a non-empty string`);
    else if (c.front.length > MAX_FRONT) errors.push(`${where}: front is longer than ${MAX_FRONT} characters`);
    if (!isText(c.back)) errors.push(`${where}: back must be a non-empty string`);
    else if (c.back.length > MAX_BACK) errors.push(`${where}: back is longer than ${MAX_BACK} characters`);
    if (c.topic !== undefined) {
      if (!isText(c.topic)) errors.push(`${where}: topic must be a non-empty string`);
      else if (c.topic.length > MAX_TOPIC) errors.push(`${where}: topic is longer than ${MAX_TOPIC} characters`);
    }
  });
  return errors;
}

// The quiz engine reads `id` and `questions`; a deck's cards play that role.
const asQuiz = (deck) => ({ id: deck.id, questions: deck.cards });

/** Topics in order of first appearance, with card counts. */
export function listCardTopics(deck) {
  const counts = new Map();
  for (const c of deck.cards) counts.set(topicOf(c), (counts.get(topicOf(c)) ?? 0) + 1);
  return [...counts].map(([topic, count]) => ({ topic, count }));
}

export function cardIdsForTopics(deck, topics) {
  const wanted = new Set(topics);
  return deck.cards.filter((c) => wanted.has(topicOf(c))).map((c) => c.id);
}

/** A fresh session: each chosen card queued once in random order (all cards by default). Plain JSON. */
export function createCardSession(deck, rng = Math.random, { cardIds = null, mode = 'full' } = {}) {
  const { quizId, ...rest } = createSession(asQuiz(deck), rng, { questionIds: cardIds, mode });
  return { ...rest, deckId: quizId };
}

/** Whether a saved session still matches the deck (the deck file may have changed since). */
export function isCardSessionCompatible(state, deck) {
  if (!isPlainObject(state)) return false;
  const { deckId, ...rest } = state;
  return isSessionCompatible({ ...rest, quizId: deckId }, asQuiz(deck));
}

export function currentCard(state, deck) {
  return state.queue.length === 0 ? null : (deck.cards.find((c) => c.id === state.queue[0]) ?? null);
}

/** Rates the current card: `known` true = "ידעתי". Returns the new state; the old one is untouched. */
export function rate(state, deck, known, rng = Math.random) {
  const card = currentCard(state, deck);
  if (!card) throw new Error('session is already complete');
  return { ...advance(state, known ? 'correct' : 'wrong', rng), card, known };
}

/** End-screen numbers: first-try known percent, cards that came back, weak topics. */
export function summarizeDeck(state, deck) {
  const cards = deck.cards.filter((c) => Object.hasOwn(state.progress, c.id));
  const total = cards.length;
  const firstTryCorrect = cards.filter((c) => state.progress[c.id].firstTry === 'correct').length;

  const retried = cards
    .filter((c) => state.progress[c.id].misses > 0)
    .map((c) => ({ id: c.id, topic: topicOf(c), front: c.front, misses: state.progress[c.id].misses }))
    .sort((a, b) => b.misses - a.misses);

  const topics = new Map();
  for (const c of cards) {
    const t = topics.get(topicOf(c)) ?? { topic: topicOf(c), total: 0, missed: 0 };
    t.total += 1;
    if (state.progress[c.id].misses > 0) t.missed += 1;
    topics.set(topicOf(c), t);
  }
  const weakTopics = [...topics.values()]
    .filter((t) => t.missed > 0)
    .map((t) => ({ ...t, rate: t.missed / t.total }))
    .sort((a, b) => b.rate - a.rate || b.missed - a.missed);

  return {
    total,
    firstTryCorrect,
    firstTryPercent: total === 0 ? 0 : Math.round((100 * firstTryCorrect) / total),
    retried,
    weakTopics,
  };
}
