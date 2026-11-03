// Pure logic for the interactive summary pages ("labs"): XP and streak, picking warm-up questions,
// the sorter's labels, the slider and stepper positions. No DOM, no storage; randomness is injected.
import { shuffle } from './core.js';

export const XP_PER_CORRECT = 10;
export const STREAK_BONUS = 5;
export const STREAK_BONUS_FROM = 3;
export const WARMUP_QUESTIONS = 10;

/** A stored XP value as a safe non-negative integer (anything else counts as 0). */
export function normalizeXp(raw) {
  return Number.isSafeInteger(raw) && raw > 0 ? raw : 0;
}

/**
 * XP and streak after one answer. A correct answer is worth XP_PER_CORRECT, plus STREAK_BONUS once
 * the streak reaches STREAK_BONUS_FROM; a miss resets the streak and keeps the XP.
 */
export function award(state, correct) {
  const xp = normalizeXp(state?.xp);
  if (!correct) return { xp, streak: 0 };
  const streak = (Number.isSafeInteger(state?.streak) && state.streak > 0 ? state.streak : 0) + 1;
  return { xp: xp + XP_PER_CORRECT + (streak >= STREAK_BONUS_FROM ? STREAK_BONUS : 0), streak };
}

/** Up to `count` distinct questions of a quiz in random order; the quiz is not modified. */
export function pickQuestions(quiz, count = WARMUP_QUESTIONS, rng = Math.random) {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  return shuffle(questions, rng).slice(0, Math.max(0, count));
}

/** The sorter's category names from a page attribute (JSON): two to four texts, else null. */
export function parseSorterLabels(raw) {
  try {
    const labels = JSON.parse(raw);
    const ok = Array.isArray(labels) && labels.length >= 2 && labels.length <= 4
      && labels.every((l) => typeof l === 'string' && l.trim() !== '');
    return ok ? labels : null;
  } catch {
    return null;
  }
}

/** Whether `pick` (a category index) is the item's right category. */
export function sorterIsRight(answer, pick) {
  return Number.isInteger(answer) && answer === pick;
}

/** `index` kept inside a list of `length` items (used by the stepper and the slider). */
export function clampIndex(index, length) {
  if (!Number.isFinite(index) || length <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), length - 1);
}

/** The tab to focus after a key press in a tab list, or null for a key that does nothing. */
export function nextTab(key, current, count, rtl = true) {
  if (count <= 0) return null;
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
  const back = rtl ? 'ArrowRight' : 'ArrowLeft';
  if (key === forward) return (current + 1) % count;
  if (key === back) return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
