import { isValidQuizId } from './core.js';
import { keys, load } from './storage.js';

const statusEl = document.getElementById('status');
const listEl = document.getElementById('quiz-list');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderQuiz(entry) {
  const item = el('li');
  const link = el('a', 'quiz-card');
  link.href = `quiz.html?id=${encodeURIComponent(entry.id)}`;

  link.append(el('h2', null, entry.title));
  if (entry.description) link.append(el('p', 'muted', entry.description));

  const meta = el('p', 'meta');
  meta.append(el('span', null, `${entry.questionCount} שאלות`));

  const session = load(keys.session(entry.id));
  if (session && Array.isArray(session.queue) && session.queue.length > 0) {
    meta.append(el('span', 'badge', 'בתהליך'));
  }
  const results = load(keys.results(entry.id));
  if (results && Number.isFinite(results.bestPercent)) {
    meta.append(el('span', null, `שיא בניסיון ראשון: ${results.bestPercent}%`));
  }
  link.append(meta);
  item.append(link);
  return item;
}

async function main() {
  let manifest;
  try {
    const res = await fetch('quizzes/manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
  } catch (err) {
    console.error(err);
    statusEl.textContent = location.protocol === 'file:'
      ? 'יש להריץ דרך שרת (npm run serve) — הדפדפן חוסם טעינה מקובץ מקומי.'
      : 'לא הצלחנו לטעון את רשימת הבחנים.';
    return;
  }

  const quizzes = (manifest.quizzes ?? []).filter((q) => isValidQuizId(q.id));
  if (quizzes.length === 0) {
    statusEl.textContent = 'עדיין אין בחנים.';
    return;
  }
  statusEl.hidden = true;
  listEl.replaceChildren(...quizzes.map(renderQuiz));
}

main();
