// Pure logic of the drug memory game: dealing, matching, scoring, mastery levels, XP, streaks and
// achievements. No DOM, no storage, no clock: randomness comes in as `rng`, dates as 'YYYY-MM-DD'
// strings. State is plain JSON and is never mutated; every function returns new objects.
import { shuffle } from './core.js';
import { overlaps } from './drugs-core.js';

// ---------- constants ----------

/** Mastery levels per drug: 0 unseen, 1 seen, 2 familiar (earned in pairs), 3 mastered (earned by recall). */
export const LEVEL_LABELS = ['לא נראתה', 'נראתה', 'מוכרת', 'שלי'];
export const MAX_LEVEL = 3;
/** Pairs only needs recognition, so it can lift a drug to "familiar"; "mastered" takes recall (speed mode). */
export const MAX_LEVEL_BY_MODE = { pairs: 2, speed: 3 };

export const PAIR_SIZES = [6, 8, 10];
export const DEFAULT_PAIRS = 8;
export const MIN_PAIRS = 3;
export const WEAK_MIN = 4;
export const SPEED_QUESTIONS = 10;
export const SPEED_MS = { toName: 12000, toUse: 15000 };
export const DAILY_GOAL = 3;
export const DAILY_BONUS = 300;

const PAIR_POINTS = 100;
const COMBO_CAP = 5;
const MISS_PENALTY = 50;
const PERFECT_BONUS = 200;
const PAR_SECONDS_PER_PAIR = 8;
const TIME_BONUS_PER_SECOND = 10;
const SMALL_TOPIC = 3;
const MISC_TOPIC = 'שונות';

const LEVEL_WEIGHT = [3, 4, 2, 1];

// ---------- topics ----------

/** Topics are written like "פרקינסון/דיכאון"; the first part is the drug's home topic. */
export function primaryTopic(topic) {
  return String(topic).split('/')[0].trim();
}

/** Home topic per drug id; topics with fewer than 3 drugs are folded into "שונות". */
export function topicMap(drugs) {
  const counts = new Map();
  for (const d of drugs) counts.set(primaryTopic(d.topic), (counts.get(primaryTopic(d.topic)) ?? 0) + 1);
  const map = {};
  for (const d of drugs) {
    const t = primaryTopic(d.topic);
    map[d.id] = counts.get(t) < SMALL_TOPIC ? MISC_TOPIC : t;
  }
  return map;
}

/** Topic groups in order of their most common drug, each with the drug ids it holds. */
export function listTopicGroups(drugs) {
  const map = topicMap(drugs);
  const groups = new Map();
  for (const d of [...drugs].sort((a, b) => a.rank - b.rank)) {
    if (!groups.has(map[d.id])) groups.set(map[d.id], []);
    groups.get(map[d.id]).push(d.id);
  }
  const list = [...groups].map(([name, ids]) => ({ name, ids }));
  return [...list.filter((g) => g.name !== MISC_TOPIC), ...list.filter((g) => g.name === MISC_TOPIC)];
}

// ---------- progress ----------

export function emptyProgress() {
  return {
    version: 1,
    xp: 0,
    rounds: 0,
    streak: { days: 0, last: null },
    daily: { date: null, rounds: 0, bonusPaid: false },
    drugs: {},
    best: { pairs: 0, speed: 0 },
    achievements: {},
    settings: { effects: false, relaxed: false },
  };
}

const int = (v, min, max) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : min);

/** Stored progress can be missing, old or hand-edited: rebuild a valid object from whatever is there. */
export function normalizeProgress(raw) {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const out = {
    ...base,
    xp: int(raw.xp, 0, 1e9),
    rounds: int(raw.rounds, 0, 1e9),
    streak: { days: int(raw.streak?.days, 0, 1e5), last: date(raw.streak?.last) },
    daily: { date: date(raw.daily?.date), rounds: int(raw.daily?.rounds, 0, 1e5), bonusPaid: raw.daily?.bonusPaid === true },
    best: { pairs: int(raw.best?.pairs, 0, 1e9), speed: int(raw.best?.speed, 0, 1e9) },
    settings: { effects: raw.settings?.effects === true, relaxed: raw.settings?.relaxed === true },
  };
  if (raw.drugs && typeof raw.drugs === 'object') {
    for (const [id, rec] of Object.entries(raw.drugs)) {
      if (!rec || typeof rec !== 'object') continue;
      out.drugs[id] = {
        level: int(rec.level, 0, MAX_LEVEL),
        seen: int(rec.seen, 0, 1e6),
        right: int(rec.right, 0, 1e6),
        wrong: int(rec.wrong, 0, 1e6),
      };
    }
  }
  if (raw.achievements && typeof raw.achievements === 'object') {
    for (const [id, when] of Object.entries(raw.achievements)) {
      if (typeof when === 'string') out.achievements[id] = when;
    }
  }
  return out;
}

export const levelOf = (progress, id) => progress.drugs[id]?.level ?? 0;

export function countAtLevel(progress, drugs, minLevel) {
  return drugs.filter((d) => levelOf(progress, d.id) >= minLevel).length;
}

/** Drugs worth a second look: seen, but not yet familiar. Weakest first. */
export function weakDrugs(drugs, progress) {
  return drugs
    .filter((d) => (progress.drugs[d.id]?.seen ?? 0) > 0 && levelOf(progress, d.id) <= 1)
    .sort((a, b) => {
      const ra = progress.drugs[a.id];
      const rb = progress.drugs[b.id];
      return rb.wrong - ra.wrong || a.rank - b.rank;
    });
}

// ---------- XP, levels, streaks ----------

const TITLES = ['שנה א׳', 'שנה ב׳', 'שנה ג׳', 'שנה ד׳', 'מתמחים', 'בעלי ניסיון', 'מומחי תרופות', 'מאסטרים', 'אגדות הפרמקולוגיה'];

/** Total XP needed to reach a player level: 500, 1500, 3000, 5000... */
export const xpForLevel = (level) => (500 * (level - 1) * level) / 2;

export function playerLevel(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level += 1;
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return {
    level,
    title: TITLES[Math.min(level, TITLES.length) - 1],
    into: xp - from,
    need: to - from,
    fraction: (xp - from) / (to - from),
  };
}

/** Days between two 'YYYY-MM-DD' strings (UTC arithmetic, so DST never shifts it). */
export function dayDiff(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function touchStreak(streak, today) {
  if (streak.last === today) return streak;
  const gap = streak.last ? dayDiff(streak.last, today) : Infinity;
  return { days: gap === 1 ? streak.days + 1 : 1, last: today };
}

/** The streak as it should be shown now: broken if the last play was before yesterday. */
export function liveStreak(streak, today) {
  if (!streak.last) return 0;
  return dayDiff(streak.last, today) <= 1 ? streak.days : 0;
}

// ---------- picking drugs ----------

/** Two drugs whose uses share an item ("סטטוס אפילפטיקוס") can be mistaken for each other. */
const sameUse = (a, b) => overlaps(a.indication, b.indication);

/**
 * `count` distinct ids from `pool`, favouring drugs that need work (seen but shaky, then new).
 * A round never mixes two drugs with overlapping uses while the pool has another choice, so a use
 * card has one right name. A narrow pool (one topic) may not allow that; it then fills up anyway.
 */
export function pickDrugs(pool, progress, count, rng) {
  const left = pool.slice();
  const chosen = [];
  while (chosen.length < count && left.length > 0) {
    const clear = left.filter((d) => !chosen.some((c) => sameUse(c, d)));
    const from = clear.length > 0 ? clear : left;
    const weights = from.map((d) => LEVEL_WEIGHT[levelOf(progress, d.id)]);
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < from.length - 1 && r >= weights[i]) {
      r -= weights[i];
      i += 1;
    }
    chosen.push(from[i]);
    left.splice(left.indexOf(from[i]), 1);
  }
  return chosen.map((d) => d.id);
}

// ---------- pairs mode ----------

/** Cards for the given drug ids: one name card and one use card each, shuffled. */
export function dealBoard(ids, rng) {
  const cards = ids.flatMap((drugId) => [
    { drugId, kind: 'name' },
    { drugId, kind: 'use' },
  ]);
  return shuffle(cards, rng);
}

export function createPairs(ids, rng) {
  const cards = dealBoard(ids, rng);
  return {
    cards,
    pairs: ids.length,
    faceUp: [],
    locked: false,
    seen: cards.map(() => false),
    matched: [],
    missedIds: [],
    moves: 0,
    mistakes: 0,
    misses: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    done: false,
  };
}

export const isCardMatched = (state, index) => state.matched.includes(state.cards[index].drugId);

const partnerOf = (state, index) =>
  state.cards.findIndex((c, i) => i !== index && c.drugId === state.cards[index].drugId);

export const comboMultiplier = (combo) => 1 + 0.5 * (Math.min(combo, COMBO_CAP) - 1);

/**
 * Turn a card over. Returns `{ state, events }`; events are 'flip', then 'match' or 'mismatch', then 'done'.
 * After a mismatch the board stays locked until `clearMismatch`, so the player can read both cards.
 * A mismatch is a real miss only when the partner of a flipped card had already been seen:
 * guessing at unseen cards costs the combo but no points.
 */
export function flip(state, index) {
  const invalid = state.done || state.locked || !Number.isInteger(index) || index < 0 || index >= state.cards.length
    || isCardMatched(state, index) || state.faceUp.includes(index);
  if (invalid) return { state, events: [] };

  const seen = state.seen.slice();
  const events = [{ type: 'flip', index }];

  if (state.faceUp.length === 0) {
    seen[index] = true;
    return { state: { ...state, faceUp: [index], seen }, events };
  }

  const first = state.faceUp[0];
  const knownBefore = (i) => {
    const p = partnerOf(state, i);
    return p >= 0 && state.seen[p];
  };
  seen[index] = true;
  const moves = state.moves + 1;

  if (state.cards[first].drugId === state.cards[index].drugId) {
    const combo = state.combo + 1;
    const points = Math.round(PAIR_POINTS * comboMultiplier(combo));
    const drugId = state.cards[index].drugId;
    const matched = [...state.matched, drugId];
    const done = matched.length === state.pairs;
    events.push({ type: 'match', drugId, indices: [first, index], points, combo });
    if (done) events.push({ type: 'done' });
    return {
      state: {
        ...state, faceUp: [], seen, matched, moves, combo,
        bestCombo: Math.max(state.bestCombo, combo), score: state.score + points, done,
      },
      events,
    };
  }

  const culprits = [first, index].filter(knownBefore).map((i) => state.cards[i].drugId);
  const avoidable = culprits.length > 0;
  const penalty = avoidable ? Math.min(MISS_PENALTY, state.score) : 0;
  events.push({ type: 'mismatch', indices: [first, index], avoidable, penalty });
  return {
    state: {
      ...state, faceUp: [first, index], locked: true, seen, moves, combo: 0,
      mistakes: state.mistakes + 1,
      misses: state.misses + (avoidable ? 1 : 0),
      missedIds: [...new Set([...state.missedIds, ...culprits])],
      score: state.score - penalty,
    },
    events,
  };
}

export function clearMismatch(state) {
  return state.locked ? { ...state, faceUp: [], locked: false } : state;
}

export function pairStars(pairs, misses) {
  if (misses <= Math.floor(pairs / 4)) return 3;
  return misses <= pairs ? 2 : 1;
}

export function timeBonus(pairs, elapsedMs) {
  const over = PAR_SECONDS_PER_PAIR * pairs - elapsedMs / 1000;
  return Math.max(0, Math.round(over)) * TIME_BONUS_PER_SECOND;
}

/** Final result of a finished pairs round, in the shape `applyResult` takes. */
export function finishPairs(state, elapsedMs) {
  const bonus = timeBonus(state.pairs, elapsedMs);
  const perfect = state.misses === 0 ? PERFECT_BONUS : 0;
  return {
    mode: 'pairs',
    size: state.pairs,
    base: state.score,
    timeBonus: bonus,
    perfectBonus: perfect,
    score: state.score + bonus + perfect,
    misses: state.misses,
    mistakes: state.mistakes,
    moves: state.moves,
    bestCombo: state.bestCombo,
    elapsedMs,
    stars: pairStars(state.pairs, state.misses),
    outcomes: state.matched.map((drugId) => ({ drugId, ok: !state.missedIds.includes(drugId) })),
  };
}

// ---------- speed mode ----------

/**
 * Three wrong options for `drug`, from its own topic first (the confusable ones), then from the rest.
 * Drugs whose use overlaps the right one are left out: they would be right answers too. Only when
 * too few others remain are they used to fill the gap.
 */
export function pickDistractors(drug, drugs, topics, rng, count = 3) {
  const others = drugs.filter((d) => d.id !== drug.id);
  const ranked = [
    ...shuffle(others.filter((d) => topics[d.id] === topics[drug.id]), rng),
    ...shuffle(others.filter((d) => topics[d.id] !== topics[drug.id]), rng),
  ];
  const clear = ranked.filter((d) => !sameUse(drug, d));
  const rest = ranked.filter((d) => sameUse(drug, d));
  return [...clear, ...rest].slice(0, count).map((d) => d.id);
}

export function buildQuestion(drug, drugs, topics, rng, direction = rng() < 0.6 ? 'toName' : 'toUse') {
  const options = shuffle([drug.id, ...pickDistractors(drug, drugs, topics, rng)], rng);
  return { drugId: drug.id, direction, options, correctIndex: options.indexOf(drug.id), ms: SPEED_MS[direction] };
}

export function createSpeed(ids, drugs, rng) {
  const topics = topicMap(drugs);
  const byId = new Map(drugs.map((d) => [d.id, d]));
  return {
    questions: ids.map((id) => buildQuestion(byId.get(id), drugs, topics, rng)),
    index: 0,
    answers: [],
    score: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    done: false,
  };
}

export const speedMultiplier = (streak) => 1 + 0.25 * Math.min(streak, 4);

/** Answer the current question (`choice` null = time ran out). `msLeft` is what remained on the clock. */
export function answerSpeed(state, choice, msLeft) {
  if (state.done) return { state, event: null };
  const q = state.questions[state.index];
  const correct = choice === q.correctIndex;
  const streak = correct ? state.streak + 1 : 0;
  const points = correct
    ? Math.round((100 + (100 * Math.max(0, Math.min(msLeft, q.ms))) / q.ms) * speedMultiplier(state.streak))
    : 0;
  const index = state.index + 1;
  return {
    state: {
      ...state,
      index,
      answers: [...state.answers, { drugId: q.drugId, ok: correct }],
      score: state.score + points,
      correct: state.correct + (correct ? 1 : 0),
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      done: index >= state.questions.length,
    },
    event: { type: correct ? 'correct' : choice === null ? 'timeout' : 'wrong', points, streak, correctIndex: q.correctIndex },
  };
}

export function speedStars(correct, total) {
  const ratio = correct / total;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.6) return 2;
  return correct > 0 ? 1 : 0;
}

export function finishSpeed(state) {
  const total = state.questions.length;
  return {
    mode: 'speed',
    size: total,
    base: state.score,
    timeBonus: 0,
    perfectBonus: 0,
    score: state.score,
    correct: state.correct,
    total,
    bestStreak: state.bestStreak,
    stars: speedStars(state.correct, total),
    outcomes: state.answers.map((a) => ({ drugId: a.drugId, ok: a.ok })),
  };
}

// ---------- achievements ----------

export const ACHIEVEMENTS = [
  { id: 'first-round', icon: '🎉', title: 'סבב ראשון', desc: 'סיימו סבב ראשון', check: ({ progress }) => progress.rounds >= 1 },
  { id: 'combo-5', icon: '🔥', title: 'להבה', desc: '5 התאמות ברצף בסבב זוגות', check: ({ result }) => result.mode === 'pairs' && result.bestCombo >= 5 },
  { id: 'perfect', icon: '💎', title: 'זיכרון חד', desc: 'סבב זוגות בלי אף טעות שאפשר היה להימנע ממנה', check: ({ result }) => result.mode === 'pairs' && result.misses === 0 },
  { id: 'three-stars', icon: '⭐', title: 'שלושה כוכבים', desc: 'קבלו 3 כוכבים בסבב', check: ({ result }) => result.stars === 3 },
  { id: 'speed-ace', icon: '⚡', title: 'מהיר ובטוח', desc: '10 מתוך 10 במצב מהירות', check: ({ result }) => result.mode === 'speed' && result.correct === result.total },
  { id: 'seen-10', icon: '🔎', title: 'מגלים', desc: 'גלו 10 תרופות', check: ({ progress, drugs }) => countAtLevel(progress, drugs, 1) >= 10 },
  { id: 'seen-all', icon: '🗺️', title: 'כל המפה', desc: 'גלו את כל התרופות', check: ({ progress, drugs }) => countAtLevel(progress, drugs, 1) === drugs.length },
  { id: 'topic-done', icon: '🏅', title: 'נושא סגור', desc: 'כל התרופות בנושא אחד ברמת "מוכרת" ומעלה', check: ({ progress, drugs }) => listTopicGroups(drugs).some((g) => g.ids.every((id) => levelOf(progress, id) >= 2)) },
  { id: 'gold-10', icon: '🥇', title: 'עשר זהב', desc: '10 תרופות ברמת "שלי"', check: ({ progress, drugs }) => countAtLevel(progress, drugs, 3) >= 10 },
  { id: 'gold-all', icon: '👑', title: 'כל הקולקציה', desc: 'כל התרופות ברמת "שלי"', check: ({ progress, drugs }) => countAtLevel(progress, drugs, 3) === drugs.length },
  { id: 'streak-3', icon: '📆', title: 'שלושה ימים ברצף', desc: 'שיחקו שלושה ימים רצופים', check: ({ progress }) => progress.streak.days >= 3 },
  { id: 'streak-7', icon: '🗓️', title: 'שבוע ברצף', desc: 'שיחקו שבעה ימים רצופים', check: ({ progress }) => progress.streak.days >= 7 },
];

// ---------- applying a result ----------

function updateDrug(rec = { level: 0, seen: 0, right: 0, wrong: 0 }, ok, mode) {
  const cap = MAX_LEVEL_BY_MODE[mode];
  const level = ok ? Math.max(rec.level, Math.min(cap, rec.level + 1)) : Math.max(1, rec.level - 1);
  return { level, seen: rec.seen + 1, right: rec.right + (ok ? 1 : 0), wrong: rec.wrong + (ok ? 0 : 1) };
}

/**
 * Fold a finished round into the saved progress.
 * Returns `{ progress, report }`; the report says what to celebrate: XP, level-up, drugs that moved
 * up or down, the daily goal and newly unlocked achievements.
 */
export function applyResult(progress, result, today, drugs) {
  const before = playerLevel(progress.xp);
  const doneDrugs = {};
  const promoted = [];
  const demoted = [];
  for (const { drugId, ok } of result.outcomes) {
    const rec = progress.drugs[drugId];
    const next = updateDrug(rec, ok, result.mode);
    doneDrugs[drugId] = next;
    const was = rec?.level ?? 0;
    if (next.level > was) promoted.push(drugId);
    else if (next.level < was) demoted.push(drugId);
  }

  const sameDay = progress.daily.date === today;
  const dailyRounds = (sameDay ? progress.daily.rounds : 0) + 1;
  const paid = sameDay && progress.daily.bonusPaid;
  const dailyBonus = !paid && dailyRounds >= DAILY_GOAL ? DAILY_BONUS : 0;
  const xpGained = result.score + dailyBonus;

  let next = {
    ...progress,
    xp: progress.xp + xpGained,
    rounds: progress.rounds + 1,
    streak: touchStreak(progress.streak, today),
    daily: { date: today, rounds: dailyRounds, bonusPaid: paid || dailyBonus > 0 },
    drugs: { ...progress.drugs, ...doneDrugs },
    best: { ...progress.best, [result.mode]: Math.max(progress.best[result.mode], result.score) },
  };

  const newAchievements = [];
  const unlocked = { ...next.achievements };
  for (const a of ACHIEVEMENTS) {
    if (!unlocked[a.id] && a.check({ progress: next, result, drugs })) {
      unlocked[a.id] = today;
      newAchievements.push(a.id);
    }
  }
  next = { ...next, achievements: unlocked };

  const after = playerLevel(next.xp);
  return {
    progress: next,
    report: {
      xpGained,
      dailyBonus,
      dailyRounds,
      levelBefore: before.level,
      levelAfter: after.level,
      leveledUp: after.level > before.level,
      isBest: result.score > progress.best[result.mode],
      promoted,
      demoted,
      newAchievements,
    },
  };
}
