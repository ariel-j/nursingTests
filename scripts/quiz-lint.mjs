// Soft checks on how guessable a quiz is. Pure: no I/O. validate.mjs prints these as warnings
// (they never fail the build), because a quiz can be correct and still give the answer away.
const MIN_QUESTIONS = 20; // below this the percentages mean nothing
const LONGEST_SHARE_MAX = 0.5; // by chance the correct option is the strictly longest ~25-30% of the time
const MEDIAN_RATIO_MAX = 1.4; // correct length / mean wrong length
const FEATURE_SHARE_MAX = 0.3; // questions where only the correct option has the feature
const ABSOLUTES = /(?:^|\s)(?:בלבד|תמיד|לעולם|אף פעם|כלל לא|בהכרח)(?:\s|$|[.,;])/;
const FEATURES = {
  'parentheses': /[()]/,
  'Latin letters': /[A-Za-z]/,
  'digits': /\d/,
};

// Per question: the correct option is this much longer than the average wrong one, and longer than
// every wrong one by at least LONG_MIN_CHARS (so two short drug names never count).
const LONG_RATIO = 1.3;
const LONG_MIN_CHARS = 6;
// Explanatory punctuation: a list or a clause that only the correct option spells out.
const EXPLAINS = /[,:;—]/;
const QUESTION_FEATURES = { ...FEATURES, 'a list or clause (, : ; —)': EXPLAINS };

const len = (o) => o.text.length;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (x) => `${Math.round(x * 100)}%`;

/**
 * The tells one question has, i.e. ways to spot its correct option without knowing the material:
 * much the longest; the only option with parentheses, Latin letters, digits or explanatory
 * punctuation; or an absolute word (בלבד, תמיד...) on a wrong option while the correct one has none.
 * [] when the options look alike.
 */
export function questionTells(q) {
  const opts = q.options ?? [];
  if (opts.length < 2 || !opts[q.correct]) return [];
  const tells = [];
  const right = opts[q.correct];
  const wrong = opts.filter((_, i) => i !== q.correct);
  const mean = wrong.reduce((n, o) => n + len(o), 0) / wrong.length;
  if (len(right) >= mean * LONG_RATIO && len(right) - Math.max(...wrong.map(len)) >= LONG_MIN_CHARS) {
    tells.push(`longest (${(len(right) / mean).toFixed(1)}×)`);
  }
  for (const [name, rx] of Object.entries(QUESTION_FEATURES)) {
    if (rx.test(right.text) && !wrong.some((o) => rx.test(o.text))) tells.push(`only one with ${name}`);
  }
  if (!ABSOLUTES.test(right.text) && wrong.some((o) => ABSOLUTES.test(o.text))) {
    tells.push('absolute word on a wrong option');
  }
  return tells;
}

// Per-question tells are judged at any quiz size.
function toldWarning(quiz) {
  const told = (quiz.questions ?? []).filter((q) => questionTells(q).length > 0).map((q) => q.id);
  if (told.length === 0) return [];
  const more = told.length > 8 ? '…' : '';
  return [`${told.length} questions give the answer away (${told.slice(0, 8).join(', ')}${more}); see npm run lint-quiz -- quizzes/${quiz.id ?? '<id>'}.json`];
}

/** Warnings (strings) for one quiz; [] when it looks balanced or is too small to judge. */
export function lintQuiz(quiz) {
  const qs = quiz.questions ?? [];
  if (qs.length < MIN_QUESTIONS) return toldWarning(quiz);
  const warnings = [];

  let longest = 0;
  const ratios = [];
  const extreme = [];
  for (const q of qs) {
    const right = q.options[q.correct];
    const wrong = q.options.filter((_, i) => i !== q.correct);
    const mean = wrong.reduce((n, o) => n + len(o), 0) / wrong.length;
    const ratio = len(right) / mean;
    ratios.push(ratio);
    if (len(right) > Math.max(...wrong.map(len))) {
      longest += 1;
      if (ratio > 1.6) extreme.push(q.id);
    }
  }
  const share = longest / qs.length;
  if (share > LONGEST_SHARE_MAX) {
    warnings.push(`the correct option is the longest in ${pct(share)} of the questions (chance is about 25%); lengthen the distractors or shorten the answer`);
  }
  const med = median(ratios);
  if (med > MEDIAN_RATIO_MAX) {
    warnings.push(`the correct option is ${med.toFixed(2)}× the average wrong option in length (median); keep it near 1`);
  }
  if (extreme.length > qs.length * 0.1) {
    warnings.push(`${extreme.length} questions have a correct option over 1.6× longer than every wrong one (${extreme.slice(0, 5).join(', ')}…)`);
  }

  for (const [name, rx] of Object.entries(FEATURES)) {
    const only = qs.filter((q) => {
      const has = q.options.map((o) => rx.test(o.text));
      return has.filter(Boolean).length === 1 && has[q.correct];
    }).length;
    if (only / qs.length > FEATURE_SHARE_MAX) {
      warnings.push(`only the correct option has ${name} in ${pct(only / qs.length)} of the questions; give the distractors the same`);
    }
  }

  let absRight = 0;
  let absWrong = 0;
  for (const q of qs) {
    q.options.forEach((o, i) => {
      if (ABSOLUTES.test(o.text)) (i === q.correct ? absRight++ : absWrong++);
    });
  }
  if (absWrong >= 10 && absWrong >= 5 * Math.max(absRight, 1)) {
    warnings.push(`absolute words (בלבד, תמיד, לעולם...) appear in ${absWrong} wrong options but ${absRight} correct ones; they give the wrong answers away`);
  }

  return [...warnings, ...toldWarning(quiz)];
}
