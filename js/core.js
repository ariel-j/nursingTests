// Pure quiz logic: queue, scoring, stats, validation.
// No DOM and no storage access, so it runs unchanged in the browser and in Node tests.
// Every function that needs randomness takes an `rng` returning a float in [0, 1).

export const OPTION_COUNT = 4;
// A requeued question comes back as the Nth next question, N in [REQUEUE_MIN, REQUEUE_MAX].
export const REQUEUE_MIN = 2;
export const REQUEUE_MAX = 5;
// Consecutive correct answers needed to master a question that was missed or skipped.
export const MASTERY_STREAK = 2;
export const SESSION_VERSION = 1;
// full: every question; topics: questions from chosen topics; retry: questions missed last time;
// starred: questions the user starred.
export const SESSION_MODES = ['full', 'topics', 'retry', 'starred'];
// practice: feedback after every answer, misses come back until mastered;
// exam: one pass with no feedback, scored and reviewed at the end.
export const SESSION_STYLES = ['practice', 'exam'];
// Id of the in-memory quiz that combines starred questions from several quizzes. Not a valid
// quiz id, so it can never clash with a real quiz's storage keys.
export const STARRED_QUIZ_ID = '*starred';

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const QUIZ_KEYS = new Set(['id', 'subject', 'unit', 'title', 'description', 'questions']);
const QUESTION_KEYS = new Set(['id', 'topic', 'question', 'options', 'correct', 'explanation']);
const OPTION_KEYS = new Set(['text', 'note']);

// Options are shuffled on every display, so an option must never point at another by position
// ("א+ב נכונות", "תשובה ג", "all of the above").
const HEB_LABEL = `[אבגד]['׳]?`;
const POSITIONAL_PATTERNS = [
  new RegExp(`(?:^|[\\s(])${HEB_LABEL}\\s*(?:\\+|,|ו-?|ו־)\\s*${HEB_LABEL}(?=$|[\\s).,])`),
  new RegExp(`תשוב(?:ה|ות)\\s+${HEB_LABEL}(?=$|[\\s).,+])`),
  /כל התשובות|אף (?:אחת מה)?תשוב/,
  /\b(?:all|none|both) of the (?:above|options)\b/i,
];

export function hasPositionalReference(text) {
  return POSITIONAL_PATTERNS.some((re) => re.test(text));
}

// ---------- randomness ----------

export function randomInt(min, max, rng = Math.random) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function shuffle(items, rng = Math.random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------- display text ----------

const NUMERIC_RANGE = /(\d[\d.,]*%?)\s*([–-])\s*(\d[\d.,]*%?)/g;

/**
 * Wraps numeric ranges ("5–8", "0.02–0.1") in Unicode LTR isolates so RTL text does not
 * display them reversed as "8–5". Plain characters, so it stays safe with textContent.
 */
export function isolateNumberRanges(text) {
  return text.replace(NUMERIC_RANGE, '⁦$1$2$3⁩');
}

// ---------- validation ----------

export function isValidQuizId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function unknownKeys(obj, allowed, where, errors) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) errors.push(`${where}: unknown field "${key}"`);
  }
}

/** Returns a list of human-readable problems; an empty list means the quiz is valid. */
export function validateQuiz(quiz) {
  const errors = [];
  if (!isPlainObject(quiz)) return ['quiz must be a JSON object'];

  unknownKeys(quiz, QUIZ_KEYS, 'quiz', errors);
  if (!isValidQuizId(quiz.id)) errors.push('quiz.id must be lowercase letters, digits and single hyphens');
  if (!isText(quiz.subject)) errors.push('quiz.subject must be a non-empty string');
  if (quiz.unit !== undefined && !isText(quiz.unit)) errors.push('quiz.unit must be a non-empty string');
  if (!isText(quiz.title)) errors.push('quiz.title must be a non-empty string');
  if (quiz.description !== undefined && typeof quiz.description !== 'string') {
    errors.push('quiz.description must be a string');
  }
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    errors.push('quiz.questions must be a non-empty array');
    return errors;
  }

  const seenIds = new Set();
  quiz.questions.forEach((q, i) => {
    const where = `questions[${i}]${isPlainObject(q) && isText(q.id) ? ` (${q.id})` : ''}`;
    if (!isPlainObject(q)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    unknownKeys(q, QUESTION_KEYS, where, errors);

    if (!isText(q.id)) errors.push(`${where}: id must be a non-empty string`);
    else if (seenIds.has(q.id)) errors.push(`${where}: duplicate question id`);
    else seenIds.add(q.id);

    if (!isText(q.topic)) errors.push(`${where}: topic must be a non-empty string`);
    if (!isText(q.question)) errors.push(`${where}: question must be a non-empty string`);
    if (!isText(q.explanation)) errors.push(`${where}: explanation must be a non-empty string`);
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= OPTION_COUNT) {
      errors.push(`${where}: correct must be an integer 0-${OPTION_COUNT - 1}`);
    }

    if (!Array.isArray(q.options) || q.options.length !== OPTION_COUNT) {
      errors.push(`${where}: options must be an array of exactly ${OPTION_COUNT}`);
      return;
    }
    const texts = new Set();
    q.options.forEach((opt, j) => {
      const owhere = `${where}.options[${j}]`;
      if (!isPlainObject(opt)) {
        errors.push(`${owhere}: must be an object`);
        return;
      }
      unknownKeys(opt, OPTION_KEYS, owhere, errors);
      if (!isText(opt.text)) {
        errors.push(`${owhere}: text must be a non-empty string`);
      } else {
        const norm = opt.text.trim();
        if (texts.has(norm)) errors.push(`${owhere}: duplicate option text`);
        texts.add(norm);
        if (hasPositionalReference(norm)) {
          errors.push(`${owhere}: refers to other options by position, which breaks when options are shuffled`);
        }
      }
      if (opt.note !== undefined && typeof opt.note !== 'string') {
        errors.push(`${owhere}: note must be a string`);
      }
    });
  });

  return errors;
}

// ---------- session ----------

function blankProgress() {
  return { attempts: 0, firstTry: null, misses: 0, streak: 0, mastered: false };
}

/**
 * Topics in order of first appearance, with question counts. `field` picks another grouping
 * field, e.g. 'group' for the units of a mixed quiz.
 */
export function listTopics(quiz, field = 'topic') {
  const counts = new Map();
  for (const q of quiz.questions) counts.set(q[field], (counts.get(q[field]) ?? 0) + 1);
  return [...counts].map(([topic, count]) => ({ topic, count }));
}

export function questionIdsForTopics(quiz, topics, field = 'topic') {
  const wanted = new Set(topics);
  return quiz.questions.filter((q) => wanted.has(q[field])).map((q) => q.id);
}

// ---------- mixed practice (all quizzes of one subject) ----------

/** Stable, storage-safe quiz id for a subject's mixed practice: "mix-" + a short hash of the name. */
export function mixedQuizId(subject) {
  let h = 0x811c9dc5; // FNV-1a, 32 bit
  for (let i = 0; i < subject.length; i++) {
    h ^= subject.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `mix-${(h >>> 0).toString(36)}`;
}

/**
 * Merges validated quizzes of one subject into a single practice quiz, in the given order.
 * Each question gets `group` (its quiz's unit, or the quiz title when there is no unit); its id
 * is prefixed with the quiz id (two quizzes can both have "q001") and its topic with the group
 * (two units can both have a topic called "עקרונות כלליים").
 */
export function buildMixedQuiz(subject, quizzes) {
  return { id: mixedQuizId(subject), subject, mixed: true, questions: mergeQuestions(quizzes, (quiz) => quiz.unit ?? quiz.title) };
}

function mergeQuestions(quizzes, groupOf) {
  return quizzes.flatMap((quiz) => {
    const group = groupOf(quiz);
    return quiz.questions.map((q) => ({ ...q, id: `${quiz.id}/${q.id}`, topic: `${group} · ${q.topic}`, group }));
  });
}

/**
 * A fresh session with each chosen question queued once, in random order. Defaults to the whole
 * quiz. The state is plain JSON, so it can be saved as is.
 */
/** Sessions saved before styles existed are practice sessions. */
export function sessionStyle(state) {
  return state.style ?? 'practice';
}

export function createSession(
  quiz,
  rng = Math.random,
  { questionIds = null, mode = 'full', style = 'practice' } = {},
) {
  if (!SESSION_MODES.includes(mode)) throw new Error(`unknown session mode: ${mode}`);
  if (!SESSION_STYLES.includes(style)) throw new Error(`unknown session style: ${style}`);
  const known = new Set(quiz.questions.map((q) => q.id));
  const ids = questionIds === null
    ? [...known]
    : [...new Set(questionIds)].filter((id) => known.has(id));
  if (ids.length === 0) throw new Error('a session needs at least one question');

  const progress = {};
  for (const id of ids) progress[id] = blankProgress();
  return { version: SESSION_VERSION, quizId: quiz.id, mode, style, queue: shuffle(ids, rng), progress };
}

/** Whether a saved session still matches the quiz (the quiz file may have changed since). */
export function isSessionCompatible(state, quiz) {
  if (!isPlainObject(state) || state.version !== SESSION_VERSION || state.quizId !== quiz.id) return false;
  if (!SESSION_MODES.includes(state.mode) || !SESSION_STYLES.includes(sessionStyle(state))) return false;
  if (!Array.isArray(state.queue) || !isPlainObject(state.progress)) return false;

  const known = new Set(quiz.questions.map((q) => q.id));
  const ids = Object.keys(state.progress);
  if (ids.length === 0 || !ids.every((id) => known.has(id) && isPlainObject(state.progress[id]))) return false;
  if (state.mode === 'full' && ids.length !== known.size) return false;
  if (new Set(state.queue).size !== state.queue.length) return false;

  const queued = new Set(state.queue);
  return ids.every((id) => state.progress[id].mastered === !queued.has(id))
    && state.queue.every((id) => id in state.progress);
}

/** The quiz's questions that belong to this session, in authored order. */
export function sessionQuestions(state, quiz) {
  return quiz.questions.filter((q) => Object.hasOwn(state.progress, q.id));
}

export function questionById(quiz, id) {
  return quiz.questions.find((q) => q.id === id) ?? null;
}

export function currentQuestion(state, quiz) {
  return state.queue.length === 0 ? null : questionById(quiz, state.queue[0]);
}

/** Options in a new random order, each tagged with its authored index. Call on every display. */
export function presentOptions(question, rng = Math.random) {
  const options = question.options.map((opt, index) => ({
    text: opt.text,
    note: opt.note ?? '',
    index,
    correct: index === question.correct,
  }));
  return shuffle(options, rng);
}

/**
 * Inserts `id` so it becomes the Nth next question, N random in [REQUEUE_MIN, REQUEUE_MAX].
 * A short queue puts it at the end. Only an empty queue makes it come straight back,
 * because there is nothing else left to show in between.
 */
export function requeue(queue, id, rng = Math.random) {
  const offset = randomInt(REQUEUE_MIN, REQUEUE_MAX, rng);
  const index = Math.min(offset - 1, queue.length);
  return [...queue.slice(0, index), id, ...queue.slice(index)];
}

function advance(state, outcome, rng, choice = null) {
  if (state.queue.length === 0) throw new Error('session is already complete');
  const next = structuredClone(state);
  const id = next.queue.shift();
  const p = next.progress[id];

  p.attempts += 1;
  if (sessionStyle(state) === 'exam') {
    // One pass: the question leaves the queue whatever the outcome ("mastered" here means done),
    // and the choice is kept for the review on the end screen.
    p.firstTry = outcome;
    p.choice = choice;
    if (outcome === 'correct') p.streak = 1;
    else p.misses = 1;
    p.mastered = true;
    return { state: next, id, progress: p };
  }
  if (p.firstTry === null) p.firstTry = outcome;
  if (outcome === 'correct') {
    p.streak += 1;
    p.mastered = p.misses === 0 || p.streak >= MASTERY_STREAK;
  } else {
    p.misses += 1;
    p.streak = 0;
  }
  if (!p.mastered) next.queue = requeue(next.queue, id, rng);
  return { state: next, id, progress: p };
}

/** Answers the current question with the option at authored index `optionIndex`. */
export function answer(state, quiz, optionIndex, rng = Math.random) {
  const question = currentQuestion(state, quiz);
  if (!question) throw new Error('session is already complete');
  const correct = optionIndex === question.correct;
  const result = advance(state, correct ? 'correct' : 'wrong', rng, optionIndex);
  return { ...result, question, correct };
}

export function skip(state, quiz, rng = Math.random) {
  const question = currentQuestion(state, quiz);
  if (!question) throw new Error('session is already complete');
  return { ...advance(state, 'skipped', rng), question, correct: false };
}

export function isComplete(state) {
  return state.queue.length === 0;
}

export function progressInfo(state) {
  const all = Object.values(state.progress);
  return {
    mastered: all.filter((p) => p.mastered).length,
    answered: all.filter((p) => p.attempts > 0).length,
    total: all.length,
    queueSize: state.queue.length,
  };
}

// ---------- stars ----------

/** Starred question ids with `id` added or removed. Returns a new array. */
export function toggleStar(starred, id) {
  const list = Array.isArray(starred) ? starred : [];
  return list.includes(id) ? list.filter((s) => s !== id) : [...list, id];
}

/** The stored starred ids that still exist in the quiz, in authored order. */
export function starredIds(starred, quiz) {
  const wanted = new Set(Array.isArray(starred) ? starred : []);
  return quiz.questions.filter((q) => wanted.has(q.id)).map((q) => q.id);
}

/**
 * Where a question's star is stored: its own quiz and id. A merged quiz's question
 * ("<quiz>/<q>") points back to the quiz it came from.
 */
export function starTarget(quiz, questionId) {
  if (!quiz.mixed) return { quizId: quiz.id, questionId };
  const slash = questionId.indexOf('/');
  return { quizId: questionId.slice(0, slash), questionId: questionId.slice(slash + 1) };
}

/** "הלב · מבחן 1": the unit (or subject) and title, to tell quizzes apart in a mixed list. */
export function quizLabel(quiz) {
  return `${quiz.unit ?? quiz.subject} · ${quiz.title}`;
}

/**
 * Every question of `quizzes` in one quiz, grouped per quiz (two quizzes of one unit stay apart),
 * shaped like a mixed practice. The page offers only the starred ones; holding all of them keeps a
 * saved session valid after a question in it is unstarred.
 */
export function buildStarredQuiz(quizzes) {
  return { id: STARRED_QUIZ_ID, mixed: true, starred: true, questions: mergeQuestions(quizzes, quizLabel) };
}

/** Quiz ids a saved starred session refers to, so their files can be loaded to resume it. */
export function sessionQuizIds(state) {
  if (!isPlainObject(state) || !isPlainObject(state.progress)) return [];
  const ids = Object.keys(state.progress).map((id) => id.split('/')[0]);
  return [...new Set(ids)].filter(isValidQuizId);
}

// ---------- results ----------

export function summarize(state, quiz) {
  const questions = sessionQuestions(state, quiz);
  const total = questions.length;
  const firstTryCorrect = questions.filter((q) => state.progress[q.id].firstTry === 'correct').length;

  const retried = questions
    .filter((q) => state.progress[q.id].misses > 0)
    .map((q) => ({
      id: q.id,
      topic: q.topic,
      question: q.question,
      misses: state.progress[q.id].misses,
      choice: state.progress[q.id].choice ?? null,
    }))
    .sort((a, b) => b.misses - a.misses);

  const topics = new Map();
  for (const q of questions) {
    const t = topics.get(q.topic) ?? { topic: q.topic, total: 0, missed: 0 };
    t.total += 1;
    if (state.progress[q.id].misses > 0) t.missed += 1;
    topics.set(q.topic, t);
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

/** Folds a finished session's summary into the per-quiz history shown on the index page. */
export function recordResult(history, summary, date) {
  const prev = isPlainObject(history) ? history : { attempts: 0, bestPercent: null };
  const last = { percent: summary.firstTryPercent, date };
  return {
    attempts: (prev.attempts ?? 0) + 1,
    bestPercent: Math.max(prev.bestPercent ?? 0, last.percent),
    last,
  };
}

// ---------- history and weak-area analysis ----------
//
// History is a set of finished attempts (any mode), kept per quiz. An attempt records, for each
// question it covered, how many times that question was missed or skipped (0 = first-try correct).
// Topics are looked up from the quiz at analysis time, so editing a quiz never corrupts history.
// Attempts have unique ids, so merging two histories is a union by id: order-independent and
// idempotent, which is what makes import (and any future sync) conflict-free.

export const HISTORY_VERSION = 1;
export const MAX_ATTEMPTS = 30; // oldest attempts beyond this are dropped, bounding storage size
export const EXPORT_KIND = 'nursing-tests-stats';
// Recency: an answer counts half as much for every HALF_LIFE later answers to the same question.
export const HALF_LIFE = 2;
export const WEAK_BELOW = 0.7;
export const SOLID_AT = 0.85;
// A topic gets a level only once this many of its questions (or all, if fewer) were answered.
export const MIN_SEEN = 5;
export const TREND_DELTA = 0.05;
// "Recovered": weak at some point within this many attempts back, and not weak now.
export const RECOVERY_WINDOW = 10;
// A question is "struggling" when it was missed on first try STRUGGLE_FAILS+ times in its last STRUGGLE_WINDOW.
export const STRUGGLE_WINDOW = 3;
export const STRUGGLE_FAILS = 2;

const MAX_ATTEMPT_QUESTIONS = 2000;
const MAX_MISSES = 99;
const MAX_EXPORT_QUIZZES = 500;
const ATTEMPT_ID_PATTERN = /^[a-z0-9-]{1,40}$/;

export function emptyHistory() {
  return { version: HISTORY_VERSION, attempts: [] };
}

export function newAttemptId(now, rng = Math.random) {
  const salt = Math.floor(rng() * 36 ** 6).toString(36).padStart(6, '0');
  return `${now.getTime().toString(36)}-${salt}`;
}

/** The record of a finished session: misses per question it covered. */
export function buildAttempt(state, quiz, { id, date }) {
  const results = {};
  for (const q of sessionQuestions(state, quiz)) results[q.id] = state.progress[q.id].misses;
  return { id, date, mode: state.mode, results };
}

function sanitizeAttempt(raw) {
  if (!isPlainObject(raw) || !isPlainObject(raw.results)) return null;
  if (typeof raw.id !== 'string' || !ATTEMPT_ID_PATTERN.test(raw.id)) return null;
  if (typeof raw.date !== 'string' || raw.date.length > 40 || !Number.isFinite(Date.parse(raw.date))) return null;
  if (!SESSION_MODES.includes(raw.mode)) return null;

  const entries = Object.entries(raw.results);
  if (entries.length === 0 || entries.length > MAX_ATTEMPT_QUESTIONS) return null;
  const valid = entries.every(([id, misses]) => (
    id.length > 0 && id.length <= 64 && Number.isInteger(misses) && misses >= 0 && misses <= MAX_MISSES
  ));
  if (!valid) return null;
  return { id: raw.id, date: raw.date, mode: raw.mode, results: Object.fromEntries(entries) };
}

function normalizeAttempts(attempts) {
  const byId = new Map();
  for (const a of attempts) if (!byId.has(a.id)) byId.set(a.id, a);
  return [...byId.values()]
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(-MAX_ATTEMPTS);
}

/** Anything read from storage or a file is untrusted: keep only well-formed attempts. */
export function sanitizeHistory(raw) {
  if (!isPlainObject(raw) || raw.version !== HISTORY_VERSION || !Array.isArray(raw.attempts)) return emptyHistory();
  const attempts = raw.attempts.map(sanitizeAttempt).filter((a) => a !== null);
  return { version: HISTORY_VERSION, attempts: normalizeAttempts(attempts) };
}

export function mergeHistories(a, b) {
  const attempts = [...sanitizeHistory(a).attempts, ...sanitizeHistory(b).attempts];
  return { version: HISTORY_VERSION, attempts: normalizeAttempts(attempts) };
}

export function addAttempt(history, attempt) {
  const clean = sanitizeAttempt(attempt);
  const base = sanitizeHistory(history);
  return clean === null ? base : mergeHistories(base, { version: HISTORY_VERSION, attempts: [clean] });
}

/**
 * The file written by "export": every quiz's history in one JSON document, plus the starred
 * questions per quiz. `stars` is optional, so files from before it still import.
 */
export function buildStatsExport(histories, now, stars = {}) {
  return { kind: EXPORT_KIND, version: HISTORY_VERSION, exportedAt: now.toISOString(), quizzes: histories, stars };
}

/** Parses an export file into `{ quizId: history }`, or null if it is not a stats export. */
export function parseStatsExport(raw) {
  if (!isPlainObject(raw) || raw.kind !== EXPORT_KIND || raw.version !== HISTORY_VERSION) return null;
  if (!isPlainObject(raw.quizzes)) return null;
  const quizzes = {};
  for (const [id, history] of Object.entries(raw.quizzes).slice(0, MAX_EXPORT_QUIZZES)) {
    if (!isValidQuizId(id)) continue;
    const clean = sanitizeHistory(history);
    if (clean.attempts.length > 0) quizzes[id] = clean;
  }
  return quizzes;
}

const MAX_STARS_PER_QUIZ = 5000;
const isQuestionId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 80 && !id.includes('/');

/** A stored or imported list of starred ids: unique question ids, first occurrence kept. */
export function sanitizeStars(raw) {
  return Array.isArray(raw) ? [...new Set(raw.filter(isQuestionId))].slice(0, MAX_STARS_PER_QUIZ) : [];
}

/**
 * Union of two starred lists, `a`'s order first. Import only adds: a star removed on one device
 * is not removed on the other, as with the history it never deletes.
 */
export function mergeStars(a, b) {
  return sanitizeStars([...sanitizeStars(a), ...sanitizeStars(b)]);
}

/** The `{ quizId: [questionId] }` stars of an export file; none for a file from before stars. */
export function parseStarsExport(raw) {
  if (parseStatsExport(raw) === null || !isPlainObject(raw.stars)) return {};
  const stars = {};
  for (const [id, list] of Object.entries(raw.stars).slice(0, MAX_EXPORT_QUIZZES)) {
    if (!isValidQuizId(id)) continue;
    const clean = sanitizeStars(list);
    if (clean.length > 0) stars[id] = clean;
  }
  return stars;
}

// First-try outcomes per question (1 = correct, 0 = not), oldest first. Questions that are no
// longer in the quiz are ignored.
function questionOutcomes(attempts, quiz) {
  const known = new Set(quiz.questions.map((q) => q.id));
  const outcomes = new Map();
  for (const a of attempts) {
    for (const [id, misses] of Object.entries(a.results)) {
      if (!known.has(id)) continue;
      if (!outcomes.has(id)) outcomes.set(id, []);
      outcomes.get(id).push(misses === 0 ? 1 : 0);
    }
  }
  return outcomes;
}

function recencyScore(outcomes) {
  let sum = 0;
  let weights = 0;
  outcomes.forEach((value, i) => {
    const weight = 0.5 ** ((outcomes.length - 1 - i) / HALF_LIFE);
    sum += weight * value;
    weights += weight;
  });
  return sum / weights;
}

function levelOf(score, seen, total) {
  if (seen < Math.min(MIN_SEEN, total)) return 'unknown';
  return score < WEAK_BELOW ? 'weak' : score >= SOLID_AT ? 'solid' : 'fair';
}

/**
 * Per-topic standing after the given attempts. Each question counts once (its own recency-weighted
 * score), so retrying a few hard questions doesn't drag a topic down by sheer repetition.
 */
function topicStanding(attempts, quiz) {
  const outcomes = questionOutcomes(attempts, quiz);
  const standing = new Map();
  for (const { topic, count } of listTopics(quiz)) standing.set(topic, { total: count, seen: 0, sum: 0 });
  for (const q of quiz.questions) {
    const list = outcomes.get(q.id);
    if (!list) continue;
    const t = standing.get(q.topic);
    t.seen += 1;
    t.sum += recencyScore(list);
  }
  return new Map([...standing].map(([topic, { total, seen, sum }]) => {
    const score = seen === 0 ? null : sum / seen;
    return [topic, { total, seen, score, level: levelOf(score, seen, total) }];
  }));
}

/**
 * Where the learner stands per topic, from the stored history:
 * level 'unknown' | 'weak' | 'fair' | 'solid', score 0..1, trend 'up' | 'down' | 'flat' | null
 * (vs. just before the topic was last practised), and `recovered` (was weak recently, isn't now).
 * Also lists individual questions that keep being missed.
 */
export function analyzeHistory(history, quiz) {
  const attempts = sanitizeHistory(history).attempts;
  const n = attempts.length;
  const cache = new Map();
  const standingAfter = (length) => {
    if (!cache.has(length)) cache.set(length, topicStanding(attempts.slice(0, length), quiz));
    return cache.get(length);
  };

  const topicOf = new Map(quiz.questions.map((q) => [q.id, q.topic]));
  const lastTouched = new Map();
  attempts.forEach((a, i) => {
    for (const id of Object.keys(a.results)) {
      if (topicOf.has(id)) lastTouched.set(topicOf.get(id), i);
    }
  });

  const now = standingAfter(n);
  const topics = listTopics(quiz).map(({ topic }) => {
    const current = now.get(topic);

    let trend = null;
    const touched = lastTouched.get(topic);
    if (touched !== undefined && current.level !== 'unknown') {
      const before = standingAfter(touched).get(topic);
      if (before.level !== 'unknown') {
        const delta = current.score - before.score;
        trend = delta > TREND_DELTA ? 'up' : delta < -TREND_DELTA ? 'down' : 'flat';
      }
    }

    let recovered = false;
    if (current.level === 'fair' || current.level === 'solid') {
      for (let length = n - 1; length >= Math.max(1, n - RECOVERY_WINDOW); length--) {
        if (standingAfter(length).get(topic).level === 'weak') {
          recovered = true;
          break;
        }
      }
    }
    return { topic, ...current, trend, recovered };
  });

  const outcomes = questionOutcomes(attempts, quiz);
  const weakQuestions = quiz.questions
    .flatMap((q) => {
      const list = outcomes.get(q.id);
      if (!list) return [];
      const failures = list.slice(-STRUGGLE_WINDOW).filter((v) => v === 0).length;
      return failures >= STRUGGLE_FAILS ? [{ id: q.id, topic: q.topic, failures, seen: list.length }] : [];
    })
    .sort((a, b) => b.failures - a.failures || b.seen - a.seen);

  return { attempts: n, topics, weakQuestions };
}

// ---------- printable exam ----------

export const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד'];
// mixed: one random order, like a real exam; by-topic: grouped by topic, in topic order.
export const PRINT_ORDERS = ['mixed', 'by-topic'];
export const PRINT_DEFAULT_COUNT = 100;

/**
 * Splits `count` across topics in proportion to their sizes (largest remainder), so a short exam
 * still samples every topic fairly. `sizes` is [{ topic, count }]; returns a Map topic → n.
 */
export function allocateByTopic(sizes, count) {
  const total = sizes.reduce((sum, s) => sum + s.count, 0);
  const n = Math.min(Math.max(0, Math.floor(count)), total);
  const shares = sizes.map((s, order) => {
    const exact = total === 0 ? 0 : (s.count * n) / total;
    return { topic: s.topic, order, take: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = n - shares.reduce((sum, s) => sum + s.take, 0);
  // Ties go to the topic that appears first, so the split is stable.
  for (const s of [...shares].sort((a, b) => b.rest - a.rest || a.order - b.order)) {
    if (left === 0) break;
    s.take += 1;
    left -= 1;
  }
  return new Map(shares.map((s) => [s.topic, s.take]));
}

/** The quiz's questions whose `field` value is in `topics` (null means all), in authored order. */
function questionsOf(quiz, topics, field) {
  const wanted = topics === null ? null : new Set(topics);
  return quiz.questions.filter((q) => wanted === null || wanted.has(q[field]));
}

/**
 * Samples `count` of `questions` (clamped to what there is), split across their topics in proportion
 * to topic size, so every topic is represented. Grouped by topic, authored order inside each.
 * With a `served` history (recordServed), each topic takes the questions served least often first,
 * then the ones served longest ago, so consecutive samples overlap as little as possible.
 */
function pickPerTopic(questions, count, rng, served = null) {
  const seen = isPlainObject(served) && isPlainObject(served.seen) ? served.seen : {};
  const times = (q) => seen[q.id]?.times ?? 0;
  const last = (q) => seen[q.id]?.last ?? 0;
  const sizes = listTopics({ questions });
  const shares = allocateByTopic(sizes, count);
  const picked = [];
  for (const { topic } of sizes) {
    const pool = questions.filter((q) => q.topic === topic);
    const ranked = shuffle(pool, rng).sort((a, b) => times(a) - times(b) || last(a) - last(b));
    const taken = new Set(ranked.slice(0, shares.get(topic)).map((q) => q.id));
    picked.push(...pool.filter((q) => taken.has(q.id)));
  }
  return picked;
}

/**
 * Ids for a custom practice: `count` questions from the chosen topics (`field` values; null means
 * all), sampled in proportion per topic, least-served first when `served` is given. A count at or
 * above the pool takes every question.
 */
export function sampleQuestionIds(
  quiz,
  { topics = null, field = 'topic', count = Infinity, served = null } = {},
  rng = Math.random,
) {
  return pickPerTopic(questionsOf(quiz, topics, field), count, rng, served).map((q) => q.id);
}

/**
 * A quiz's history of sampled questions: { seen: { [id]: { times, last } } }, `last` being the
 * time (ms) it was last served. Kept per quiz file (own ids), so a quiz and a mixed practice that
 * includes it rotate through the same questions.
 */
export function recordServed(served, ids, time) {
  const seen = { ...(isPlainObject(served) && isPlainObject(served.seen) ? served.seen : {}) };
  for (const id of ids) seen[id] = { times: (seen[id]?.times ?? 0) + 1, last: time };
  return { seen };
}

/**
 * A fixed paper exam: `count` questions (clamped to what the chosen topics hold) sampled per topic,
 * options shuffled once and lettered א–ד. by-topic keeps authored order within each topic.
 * `topics` are values of `field` ('group' picks whole units of a mixed quiz); null means all.
 */
export function buildPrintExam(
  quiz,
  { topics = null, field = 'topic', count = PRINT_DEFAULT_COUNT, order = 'mixed' } = {},
  rng = Math.random,
) {
  if (!PRINT_ORDERS.includes(order)) throw new Error(`unknown print order: ${order}`);
  const picked = pickPerTopic(questionsOf(quiz, topics, field), count, rng);
  const ordered = order === 'mixed' ? shuffle(picked, rng) : picked;

  return ordered.map((q, i) => {
    const options = presentOptions(q, rng);
    const correctAt = options.findIndex((o) => o.correct);
    return {
      number: i + 1,
      id: q.id,
      topic: q.topic,
      question: q.question,
      options: options.map((o, j) => ({ letter: OPTION_LETTERS[j], text: o.text })),
      correctLetter: OPTION_LETTERS[correctAt],
      correctText: options[correctAt].text,
      explanation: q.explanation,
    };
  });
}
