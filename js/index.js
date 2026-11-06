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

function renderDeck(entry) {
  const item = el('li');
  const link = el('a', 'quiz-card deck-card');
  link.href = `cards.html?id=${encodeURIComponent(entry.id)}`;

  link.append(el('h4', null, entry.title));
  if (entry.description) link.append(el('p', 'muted', entry.description));

  const meta = el('p', 'meta');
  meta.append(
    el('span', 'kind', 'כרטיסיות'),
    el('span', null, `${entry.cardCount} כרטיסיות · ${entry.topicCount} נושאים`),
  );
  const session = load(keys.cardSession(entry.id));
  if (session && Array.isArray(session.queue) && session.queue.length > 0 && session.progress) {
    const { mastered, total } = progressInfo(session);
    meta.append(el('span', 'badge', `בתהליך · ${mastered}/${total}`));
  }
  const results = load(keys.cardResults(entry.id));
  if (results && Number.isFinite(results.bestPercent)) {
    meta.append(el('span', null, `שיא: ${results.bestPercent}%`));
  }
  link.append(meta);
  item.append(link);
  return item;
}

function renderQuiz(entry) {
  const item = el('li');
  const link = el('a', 'quiz-card');
  link.href = `quiz.html?id=${encodeURIComponent(entry.id)}`;

  link.append(el('h4', null, entry.title));
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

/** The quiz cards, then the flashcard decks, of one place in the tree. */
function renderItems(quizzes, decks) {
  const list = el('ul', 'quiz-list');
  list.append(
    ...quizzes.filter((q) => isValidQuizId(q.id)).map(renderQuiz),
    ...decks.filter((d) => isValidQuizId(d.id)).map(renderDeck),
  );
  return list;
}

/** A group of items under a heading, or a "coming soon" note when it has none. */
function renderGroup(name, quizzes, decks, headingTag) {
  const group = el('div', 'group');
  group.append(el(headingTag, null, name));
  if (quizzes.length + decks.length === 0) group.append(el('p', 'muted soon', 'בקרוב'));
  else group.append(renderItems(quizzes, decks));
  return group;
}

function renderSubject(subject) {
  const section = el('section', 'subject');
  section.append(el('h2', null, subject.name));
  // Items placed directly on the subject (no unit), then each unit as a sub-heading.
  const direct = subject.flashcards ?? [];
  if (subject.quizzes.length + direct.length > 0) section.append(renderItems(subject.quizzes, direct));
  for (const unit of subject.units) {
    section.append(renderGroup(unit.name, unit.quizzes, unit.flashcards ?? [], 'h3'));
  }
  return section;
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

  const subjects = manifest.subjects ?? [];
  const total = subjects.reduce(
    (n, s) => n + s.quizzes.length + (s.flashcards?.length ?? 0)
      + s.units.reduce((m, u) => m + u.quizzes.length + (u.flashcards?.length ?? 0), 0),
    0,
  );
  if (total === 0) {
    statusEl.textContent = 'עדיין אין בחנים.';
    return;
  }
  statusEl.hidden = true;
  subjectsEl.replaceChildren(...subjects.map(renderSubject));
}

main();
