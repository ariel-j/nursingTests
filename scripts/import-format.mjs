// Converts the authoring format (produced outside this repo) into the site's quiz format.
//
// Authoring format, per question:
//   { id, topic, question, options: [string ×4], correctIndex, explanation,
//     wrongExplanations: [string ×3] }   // one per wrong option, in option order
// Also accepted, per question (option-aligned notes, null for the correct option):
//   { id, topic, stem, options: [string ×4], answer, explanation, notes: [string|null ×4] }
//   (notes may be omitted: no option notes, the explanation alone)
// Site format: options become { text, note? }, correctIndex becomes correct.

const QUIZ_FIELDS = ['id', 'subject', 'unit', 'title', 'description'];

// Maps the stem/answer/notes variant onto the authoring fields; other questions pass through.
function normalizeQuestion(q, where) {
  if (!q || !('stem' in q || 'answer' in q || 'notes' in q)) return q;
  const { stem, answer, notes = q.options?.map(() => null), ...rest } = q;
  if (!Array.isArray(notes) || !Array.isArray(q.options) || notes.length !== q.options.length) {
    throw new Error(`${where}: notes must have one entry per option`);
  }
  return {
    ...rest,
    question: stem,
    correctIndex: answer,
    wrongExplanations: notes.filter((_, index) => index !== answer),
  };
}

function convertQuestion(raw, i) {
  const where = `questions[${i}]${raw && raw.id ? ` (${raw.id})` : ''}`;
  const q = normalizeQuestion(raw, where);
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
