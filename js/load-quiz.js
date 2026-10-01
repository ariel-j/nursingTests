// Loads the quiz a page was opened for: ?id=<quiz> is one quiz; ?subject=<name> merges all of
// that subject's quizzes for mixed practice. Shared by quiz.js and print.js.
import { buildMixedQuiz, isValidQuizId, validateQuiz } from './core.js';

/** An error whose message is ready to show the user. */
export class LoadError extends Error {}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function fetchQuiz(id) {
  const data = await fetchJson(`quizzes/${id}.json`);
  const errors = validateQuiz(data);
  if (errors.length > 0) {
    console.error(`Invalid quiz file ${id}:`, errors);
    throw new LoadError('קובץ הבוחן פגום. פרטים בקונסול.');
  }
  return data;
}

async function loadQuiz(params) {
  const subject = params.get('subject');
  if (subject === null) {
    const id = params.get('id');
    if (!isValidQuizId(id)) throw new LoadError('לא נבחר בוחן.');
    return fetchQuiz(id);
  }

  const manifest = await fetchJson('quizzes/manifest.json');
  const entry = (manifest.subjects ?? []).find((s) => s.name === subject);
  if (!entry) throw new LoadError('המקצוע לא נמצא.');
  // Same order as the home page: quizzes directly on the subject, then each unit's.
  const ids = [...entry.quizzes, ...entry.units.flatMap((u) => u.quizzes)]
    .map((q) => q.id)
    .filter(isValidQuizId);
  if (ids.length === 0) throw new LoadError('עדיין אין בחנים במקצוע הזה.');
  const quizzes = await Promise.all(ids.map(fetchQuiz));
  return {
    ...buildMixedQuiz(subject, quizzes),
    title: 'תרגול לפי נושאים',
    description: 'בחרו נושאים, והשאלות מכל הבחנים שלהם יתערבבו לתרגול אחד.',
  };
}

/** Resolves to the quiz, or rejects with an Error whose message is ready to show. */
export async function loadQuizFromUrl() {
  try {
    return await loadQuiz(new URLSearchParams(location.search));
  } catch (err) {
    if (err instanceof LoadError) throw err;
    console.error(err);
    throw new LoadError(location.protocol === 'file:'
      ? 'יש להריץ דרך שרת (npm run serve), הדפדפן חוסם טעינה מקובץ מקומי.'
      : 'לא הצלחנו לטעון את הבוחן.');
  }
}

/** "אנטומיה ופיזיולוגיה · הלב": the subject and, when present, the unit. */
export function quizPlace(quiz) {
  return quiz.unit ? `${quiz.subject} · ${quiz.unit}` : quiz.subject;
}
