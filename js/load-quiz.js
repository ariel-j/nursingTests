// Fetches and validates quiz `?id=` for a page. Throws an Error whose message is ready to show.
import { isValidQuizId, validateQuiz } from './core.js';

export async function loadQuizFromUrl() {
  const id = new URLSearchParams(location.search).get('id');
  if (!isValidQuizId(id)) throw new Error('לא נבחר בוחן.');

  let quiz;
  try {
    const res = await fetch(`quizzes/${id}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    quiz = await res.json();
  } catch (err) {
    console.error(err);
    throw new Error(location.protocol === 'file:'
      ? 'יש להריץ דרך שרת (npm run serve), הדפדפן חוסם טעינה מקובץ מקומי.'
      : 'לא הצלחנו לטעון את הבוחן.');
  }

  const errors = validateQuiz(quiz);
  if (errors.length > 0) {
    console.error('Invalid quiz file:', errors);
    throw new Error('קובץ הבוחן פגום. פרטים בקונסול.');
  }
  return quiz;
}

/** "אנטומיה ופיזיולוגיה · הלב": the subject and, when present, the unit. */
export function quizPlace(quiz) {
  return quiz.unit ? `${quiz.subject} · ${quiz.unit}` : quiz.subject;
}
