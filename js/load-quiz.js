// Loads the quiz a page was opened for: ?id=<quiz> is one quiz; ?subject=<id> (or the subject's
// name, from older links) merges all of that subject's quizzes for mixed practice.
// Shared by quiz.js and print.js.
import { buildMixedQuiz, isValidQuizId, validateQuiz } from './core.js';
import { findSubject, loadManifest, subjectPaths, subjectQuizzes } from './catalog.js';

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

  const entry = findSubject(await loadManifest(), subject);
  if (!entry) throw new LoadError('המקצוע לא נמצא.');
  // Same order as the home page: quizzes directly on the subject, then each unit's.
  const ids = subjectQuizzes(entry).map((q) => q.id);
  if (ids.length === 0) throw new LoadError('עדיין אין בחנים במקצוע הזה.');
  const quizzes = await Promise.all(ids.map(fetchQuiz));
  return {
    // Keyed by the subject's name, as before ids existed, so saved mixed sessions still resume.
    ...buildMixedQuiz(entry.name, quizzes),
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

/** The home page of the quiz's subject, or the subject list when it cannot be found. */
export async function subjectHomeHref(quiz) {
  try {
    const entry = findSubject(await loadManifest(), quiz.subject);
    return entry ? subjectPaths(entry.id).home : './';
  } catch {
    return './';
  }
}

/** "אנטומיה ופיזיולוגיה · הלב": the subject and, when present, the unit. */
export function quizPlace(quiz) {
  return quiz.unit ? `${quiz.subject} · ${quiz.unit}` : quiz.subject;
}
