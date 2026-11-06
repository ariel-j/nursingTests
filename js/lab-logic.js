// Pure logic for the interactive labs (js/lab.js does the DOM). No DOM, no storage;
// randomness is injected as an `rng` argument.
import { shuffle } from './core.js';

export const ROUND_SIZE = 10;
export const XP_PER_ANSWER = 10;
export const STREAK_BONUS = 5;
export const STREAK_BONUS_FROM = 3;

/** A new round: up to `size` distinct questions in random order. */
export function pickRound(questions, size = ROUND_SIZE, rng = Math.random) {
  return shuffle(questions, rng).slice(0, size);
}

/** XP and streak after one answer. A wrong answer resets the streak and gives no XP. */
export function award({ xp, streak }, correct) {
  if (!correct) return { xp, streak: 0 };
  const next = streak + 1;
  return { xp: xp + XP_PER_ANSWER + (next >= STREAK_BONUS_FROM ? STREAK_BONUS : 0), streak: next };
}

/**
 * Validates the data-sorter JSON of a "sort into buckets" card:
 * { labels: [string, ...], items: [[text, labelIndex, note?], ...] }. Returns the parsed object or throws.
 */
export function parseSorter(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const { labels, items } = data ?? {};
  if (!Array.isArray(labels) || labels.length < 2 || !labels.every((l) => typeof l === 'string' && l)) {
    throw new Error('sorter needs at least two labels');
  }
  if (!Array.isArray(items) || items.length === 0) throw new Error('sorter needs items');
  for (const [i, item] of items.entries()) {
    const [text, label, note] = Array.isArray(item) ? item : [];
    if (typeof text !== 'string' || !text) throw new Error(`sorter item ${i}: missing text`);
    if (!Number.isInteger(label) || label < 0 || label >= labels.length) {
      throw new Error(`sorter item ${i}: label index out of range`);
    }
    if (note !== undefined && typeof note !== 'string') throw new Error(`sorter item ${i}: note must be a string`);
  }
  return { labels, items: items.map(([text, label, note = '']) => ({ text, label, note })) };
}
