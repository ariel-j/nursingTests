import { isValidQuizId, progressInfo } from './core.js';
import { ecgPath } from './ecg.js';
import { keys, load } from './storage.js';

const statusEl = document.getElementById('status');
const subjectsEl = document.getElementById('subjects');

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

  link.append(el('h3', null, entry.title));
  if (entry.description) link.append(el('p', 'muted', entry.description));

  const meta = el('p', 'meta');
  meta.append(el('span', null, `${entry.questionCount} שאלות · ${entry.topicCount} נושאים`));

  const session = load(keys.session(entry.id));
  if (session && Array.isArray(session.queue) && session.queue.length > 0 && session.progress) {
    const { mastered, total } = progressInfo(session);
    meta.append(el('span', 'badge', `בתהליך · ${mastered}/${total}`));
  }
  const results = load(keys.results(entry.id));
  if (results && Number.isFinite(results.bestPercent)) {
    meta.append(el('span', null, `שיא: ${results.bestPercent}%`));
  }
  link.append(meta);
  item.append(link);
  return item;
}

/** Groups manifest entries by subject, keeping the manifest's order (already sorted). */
function groupBySubject(quizzes) {
  const groups = new Map();
  for (const q of quizzes) {
    const subject = q.subject || 'כללי';
    if (!groups.has(subject)) groups.set(subject, []);
    groups.get(subject).push(q);
  }
  return groups;
}

async function main() {
  document.getElementById('hero-trace').setAttribute('d', ecgPath(1, 12));

  let manifest;
  try {
    const res = await fetch('quizzes/manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
  } catch (err) {
    console.error(err);
    statusEl.textContent = location.protocol === 'file:'
      ? 'יש להריץ דרך שרת (npm run serve), הדפדפן חוסם טעינה מקובץ מקומי.'
      : 'לא הצלחנו לטעון את רשימת הבחנים.';
    return;
  }

  const quizzes = (manifest.quizzes ?? []).filter((q) => isValidQuizId(q.id));
  if (quizzes.length === 0) {
    statusEl.textContent = 'עדיין אין בחנים.';
    return;
  }
  statusEl.hidden = true;

  const sections = [];
  for (const [subject, entries] of groupBySubject(quizzes)) {
    const section = el('section', 'subject');
    section.append(el('h2', null, subject));
    const list = el('ul', 'quiz-list');
    list.append(...entries.map(renderQuiz));
    section.append(list);
    sections.push(section);
  }
  subjectsEl.replaceChildren(...sections);
}

main();
