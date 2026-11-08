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

const len = (o) => o.text.length;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (x) => `${Math.round(x * 100)}%`;

/** Warnings (strings) for one quiz; [] when it looks balanced or is too small to judge. */
export function lintQuiz(quiz) {
  const qs = quiz.questions ?? [];
  if (qs.length < MIN_QUESTIONS) return [];
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
  return warnings;
}
