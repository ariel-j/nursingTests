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

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const QUIZ_KEYS = new Set(['id', 'title', 'description', 'questions']);
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

/** A fresh session: every question queued once, in random order. The state is plain JSON. */
export function createSession(quiz, rng = Math.random) {
  const ids = quiz.questions.map((q) => q.id);
  const progress = {};
  for (const id of ids) progress[id] = blankProgress();
  return { version: SESSION_VERSION, quizId: quiz.id, queue: shuffle(ids, rng), progress };
}

/** Whether a saved session still matches the quiz (the quiz file may have changed since). */
export function isSessionCompatible(state, quiz) {
  if (!isPlainObject(state) || state.version !== SESSION_VERSION || state.quizId !== quiz.id) return false;
  if (!Array.isArray(state.queue) || !isPlainObject(state.progress)) return false;

  const ids = quiz.questions.map((q) => q.id);
  const progressIds = Object.keys(state.progress);
  if (progressIds.length !== ids.length || !ids.every((id) => isPlainObject(state.progress[id]))) return false;
  if (new Set(state.queue).size !== state.queue.length) return false;

  const queued = new Set(state.queue);
  return ids.every((id) => state.progress[id].mastered === !queued.has(id))
    && state.queue.every((id) => ids.includes(id));
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

function advance(state, outcome, rng) {
  if (state.queue.length === 0) throw new Error('session is already complete');
  const next = structuredClone(state);
  const id = next.queue.shift();
  const p = next.progress[id];

  p.attempts += 1;
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
  const result = advance(state, correct ? 'correct' : 'wrong', rng);
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
    total: all.length,
    queueSize: state.queue.length,
  };
}

// ---------- results ----------

export function summarize(state, quiz) {
  const total = quiz.questions.length;
  const firstTryCorrect = quiz.questions.filter((q) => state.progress[q.id].firstTry === 'correct').length;

  const retried = quiz.questions
    .filter((q) => state.progress[q.id].misses > 0)
    .map((q) => ({ id: q.id, topic: q.topic, question: q.question, misses: state.progress[q.id].misses }))
    .sort((a, b) => b.misses - a.misses);

  const topics = new Map();
  for (const q of quiz.questions) {
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
