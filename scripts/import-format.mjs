// Converts the authoring format (produced outside this repo) into the site's quiz format.
//
// Authoring format, per question:
//   { id, topic, question, options: [string ×4], correctIndex, explanation,
//     wrongExplanations: [string ×3] }   // one per wrong option, in option order
// Site format: options become { text, note? }, correctIndex becomes correct.

const QUIZ_FIELDS = ['id', 'subject', 'unit', 'title', 'description'];

function convertQuestion(q, i) {
  const where = `questions[${i}]${q && q.id ? ` (${q.id})` : ''}`;
  if (!q || !Array.isArray(q.options) || !q.options.every((o) => typeof o === 'string')) {
    throw new Error(`${where}: options must be an array of strings`);
  }
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
    throw new Error(`${where}: correctIndex must point at one of the options`);
  }
  const wrong = q.wrongExplanations ?? [];
  if (!Array.isArray(wrong) || wrong.length !== q.options.length - 1) {
    throw new Error(`${where}: wrongExplanations must have one entry per wrong option`);
  }

  let w = 0;
  const options = q.options.map((text, index) => {
    if (index === q.correctIndex) return { text };
    const note = wrong[w++];
    return typeof note === 'string' && note.trim() !== '' ? { text, note } : { text };
  });

  return {
    id: q.id,
    topic: q.topic,
    question: q.question,
    options,
    correct: q.correctIndex,
    explanation: q.explanation,
  };
}

/**
 * `overrides` replaces quiz-level fields (id, subject, unit, title, description) from the source.
 * Throws on structural problems; content rules are left to validateQuiz.
 */
export function fromAuthoringFormat(source, overrides = {}) {
  if (!source || !Array.isArray(source.questions)) throw new Error('source must have a "questions" array');
  const quiz = {};
  for (const field of QUIZ_FIELDS) {
    const value = overrides[field] ?? source[field];
    if (value !== undefined && value !== '') quiz[field] = value;
  }
  quiz.questions = source.questions.map(convertQuestion);
  return quiz;
}
