// Pure scoring and helpers for the drug-card games (drugs-shell.js, drugs-games.js, the matching
// game in drugs.js): points with a streak bonus, stars, personal bests, best times, the suffix split
// used to highlight "Meto|prolol", and the blitz clock. No DOM, no storage.

export const ROUND_SIZE = 10;
export const BLITZ_SECONDS = 60;
export const BASE_POINTS = 10;
// Each answer in a streak after the first adds this much, up to MAX_BONUS: 10, 15, 20, 25, 30, 30…
export const STREAK_STEP = 5;
export const MAX_BONUS = 20;

/** Points for one answer; `streak` counts this answer (1 = first right answer in a row). */
export function pointsFor(correct, streak) {
  if (!correct) return 0;
  return BASE_POINTS + Math.min(Math.max(streak - 1, 0) * STREAK_STEP, MAX_BONUS);
}

/** The state of a round after one answer. State: { answered, right, score, streak, bestStreak }. */
export function scoreAnswer(state, correct) {
  const streak = correct ? state.streak + 1 : 0;
  const points = pointsFor(correct, streak);
  return {
    answered: state.answered + 1,
    right: state.right + (correct ? 1 : 0),
    score: state.score + points,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    points,
  };
}

export const newRoundState = () => ({ answered: 0, right: 0, score: 0, streak: 0, bestStreak: 0, points: 0 });

/** 0-3 stars from the share of right answers: 90% → 3, 70% → 2, 40% → 1. */
export function starsFor(right, total) {
  if (total === 0) return 0;
  const share = right / total;
  if (share >= 0.9) return 3;
  if (share >= 0.7) return 2;
  if (share >= 0.4) return 1;
  return 0;
}

const isCount = (n) => Number.isInteger(n) && n >= 0;

/**
 * Personal best of one game after a finished round: { score, stars, plays }. A damaged saved
 * value counts as no best. Returns { best, isNew } (isNew only when a previous best was beaten
 * or this is the first round with a positive score).
 */
export function recordBest(saved, { score, stars }) {
  const prev = saved && isCount(saved.score) && isCount(saved.plays) ? saved : null;
  const isNew = score > (prev?.score ?? 0);
  return {
    best: {
      score: Math.max(score, prev?.score ?? 0),
      stars: Math.max(stars, isCount(prev?.stars) ? prev.stars : 0),
      plays: (prev?.plays ?? 0) + 1,
    },
    isNew,
  };
}

/** Best (lowest) time per key ("family|field") in ms; returns { times, isNew }. */
export function recordBestTime(saved, key, ms) {
  const times = saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...saved } : {};
  const prev = Number.isFinite(times[key]) ? times[key] : null;
  const isNew = prev === null || ms < prev;
  if (isNew) times[key] = ms;
  return { times, isNew };
}

/** "1:05" from milliseconds (rounded down to whole seconds). */
export function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Seconds left on the blitz clock (whole, rounded up so "0" means really over). */
export function secondsLeft(startMs, nowMs, seconds = BLITZ_SECONDS) {
  return Math.max(0, Math.ceil(seconds - (nowMs - startMs) / 1000));
}

/**
 * Splits a drug-name word at the part its suffix pattern matches: "Metoprolol" with "olol$" →
 * { head: "Metopr", tail: "olol" }. No match (or a bad pattern) → the whole word as head.
 */
export function splitBySuffix(word, pattern) {
  let match = null;
  try {
    match = new RegExp(pattern, 'i').exec(word);
  } catch {
    // a bad pattern highlights nothing
  }
  if (!match || match[0] === '') return { head: word, tail: '', lead: '' };
  // A prefix pattern (cef-) highlights the start instead.
  if (match.index === 0 && match[0].length < word.length) {
    return { lead: word.slice(0, match[0].length), head: word.slice(match[0].length), tail: '' };
  }
  return { lead: '', head: word.slice(0, match.index), tail: word.slice(match.index) };
}
