// Home page. Without ?subject= it lists the subjects to choose from; with ?subject=<id> it shows
// that subject: mixed practice, the printable exam, its summaries and videos, then its quizzes by unit.
import { isValidQuizId, mixedQuizId, progressInfo } from './core.js';
import { findSubject, loadManifest, loadMedia, mediaCount, subjectPaths, subjectQuizzes, subjectStats, unitAnchor } from './catalog.js';
import { keys, load } from './storage.js';
import { summariesFor } from './summary-list.js';

const SITE_TITLE = 'תרגול למבחנים בסיעוד';
const $ = (id) => document.getElementById(id);
const ui = {
  subjectNav: $('subject-nav'),
  title: $('page-title'),
  lede: $('lede'),
  status: $('status'),
  content: $('content'),
};

const num = (n) => n.toLocaleString('he-IL');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The saved in-progress session of a quiz, if there is one. */
function savedSession(id) {
  const session = load(keys.session(id));
  return session && Array.isArray(session.queue) && session.queue.length > 0 && session.progress ? session : null;
}

/** Thin progress bar for an in-progress saved session, or nothing. */
function sessionProgress(id) {
  const session = savedSession(id);
  if (!session) return null;
  const { mastered, total } = progressInfo(session);
  const progress = el('div', 'card-progress', `בתהליך: נשלטו ${mastered} מתוך ${total}`);
  const bar = el('span', 'bar is-progress');
  bar.setAttribute('aria-hidden', 'true');
  const fill = el('i');
  fill.style.inlineSize = `${total === 0 ? 0 : Math.round((100 * mastered) / total)}%`;
  bar.append(fill);
  progress.append(bar);
  return progress;
}

function card(href, className, title, ...rest) {
  const link = el('a', `quiz-card ${className}`.trim());
  link.href = href;
  link.append(el('h3', 'card-title', title), ...rest.filter(Boolean));
  const item = el('li');
  item.append(link);
  return item;
}

// ---------- subject list ----------

function renderSubjectCard(subject, media) {
  const { quizCount, questionCount, groupCount } = subjectStats(subject);
  const summaryCount = summariesFor(subject.id).length;
  const videoCount = mediaCount(media, subject.id);
  const parts = quizCount === 0
    ? ['בחנים בקרוב']
    : [`${groupCount} נושאים`, `${quizCount} בחנים`, `${num(questionCount)} שאלות`];
  if (summaryCount > 0) parts.push(`${summaryCount} סיכומים`);
  if (videoCount > 0) parts.push(`${videoCount} סרטונים וחומרים`);
  const meta = el('p', 'meta');
  meta.append(...parts.map((p) => el('span', null, p)));

  const inProgress = [...subjectQuizzes(subject).map((q) => q.id), mixedQuizId(subject.name)]
    .filter((id) => savedSession(id)).length;
  const progress = inProgress > 0 ? el('p', 'card-progress', `${inProgress} בתהליך`) : null;

  return card(subjectPaths(subject.id).home, 'subject-card', subject.name, meta, progress);
}

function renderSubjectList(subjects, media) {
  document.title = SITE_TITLE;
  const list = el('ul', 'quiz-list subject-list');
  list.append(...subjects.map((s) => renderSubjectCard(s, media)));
  ui.content.replaceChildren(list);
}

// ---------- one subject ----------

function renderQuiz(entry) {
  const meta = el('p', 'meta');
  meta.append(el('span', null, `${entry.questionCount} שאלות · ${entry.topicCount} נושאים`));
  const results = load(keys.results(entry.id));
  if (results && Number.isFinite(results.bestPercent)) {
    meta.append(el('span', null, `שיא: ${results.bestPercent}%`));
  }
  return card(
    `quiz.html?id=${encodeURIComponent(entry.id)}`,
    '',
    entry.title,
    entry.description ? el('p', 'muted', entry.description) : null,
    meta,
    sessionProgress(entry.id),
  );
}

/** Mixed practice, the printable exam, the summaries and the videos: whichever this subject has. */
function renderTools(subject, media) {
  const { quizCount, questionCount, groupCount, canMix } = subjectStats(subject);
  const paths = subjectPaths(subject.id);
  const summaryCount = summariesFor(subject.id).length;
  const videoCount = mediaCount(media, subject.id);
  const items = [];
  if (canMix) {
    items.push(card(paths.practice, 'mix-card', 'בחירת נושאים למבחן',
      el('p', 'muted', 'בוחרים כמה נושאים, והשאלות מכל הבחנים שלהם מתערבבות לתרגול אחד.'),
      el('p', 'meta', `${groupCount} נושאים · ${num(questionCount)} שאלות`),
      sessionProgress(mixedQuizId(subject.name))));
  }
  if (quizCount > 0) {
    items.push(card(paths.print, 'tool-card', 'מבחן להדפסה',
      el('p', 'muted', 'מבחן מכל הנושאים או מחלקם, עם מפתח תשובות. אפשר לשמור כ‑PDF.')));
  }
  if (summaryCount > 0) {
    items.push(card(paths.summaries, 'tool-card', 'סיכומים קצרים',
      el('p', 'muted', `${summaryCount} סיכומים מרוכזים, להדפסה או לשמירה כ‑PDF.`)));
  }
  if (videoCount > 0) {
    items.push(card(paths.media, 'tool-card', 'סרטוני הסבר קצרים',
      el('p', 'muted', `סרטון וחומרי עזר לכל תת‑נושא · ${videoCount} פריטים.`)));
  }
  if (items.length === 0) return null;
  const list = el('ul', 'quiz-list tool-list');
  list.setAttribute('aria-label', 'כלים');
  list.append(...items);
  return list;
}

/** A unit's quizzes under a heading, or a "coming soon" note when it has none. */
function renderUnit(unit, index) {
  const group = el('section', 'group');
  group.id = unitAnchor(index);
  group.append(el('h2', 'group-title', unit.name));
  if (unit.quizzes.length === 0) {
    group.append(el('p', 'muted soon', 'בקרוב'));
  } else {
    const list = el('ul', 'quiz-list');
    list.append(...unit.quizzes.filter((q) => isValidQuizId(q.id)).map(renderQuiz));
    group.append(list);
  }
  return group;
}

function renderSubject(subject, media) {
  document.title = `${subject.name} · ${SITE_TITLE}`;
  ui.subjectNav.hidden = false;
  ui.title.textContent = subject.name;
  const nodes = [];
  if (subjectStats(subject).quizCount === 0) {
    ui.lede.textContent = 'הבחנים במקצוע הזה בדרך. כשיתווספו, הם יופיעו כאן לפי נושא, עם תרגול משולב, מבחן להדפסה וסיכומים.';
  } else {
    ui.lede.textContent = 'בחרו בוחן לפי נושא, או תרגול שמערבב כמה נושאים. ההתקדמות נשמרת בדפדפן.';
  }
  const tools = renderTools(subject, media);
  if (tools) nodes.push(tools);
  // Quizzes placed directly on the subject (no unit), then each unit as a section.
  const own = subject.quizzes.filter((q) => isValidQuizId(q.id));
  if (own.length > 0) {
    const list = el('ul', 'quiz-list');
    list.append(...own.map(renderQuiz));
    nodes.push(list);
  }
  nodes.push(...subject.units.map(renderUnit));
  ui.content.replaceChildren(...nodes);

  // The page is built after load, so jump to a unit (#unit-2, from the side menu) once it exists.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

async function main() {
  let manifest;
  const media = loadMedia();
  try {
    manifest = await loadManifest();
  } catch (err) {
    console.error(err);
    ui.status.textContent = location.protocol === 'file:'
      ? 'יש להריץ דרך שרת (npm run serve), הדפדפן חוסם טעינה מקובץ מקומי.'
      : 'לא הצלחנו לטעון את רשימת הבחנים.';
    return;
  }

  const subjects = manifest.subjects ?? [];
  if (subjects.length === 0) {
    ui.status.textContent = 'עדיין אין מקצועות.';
    return;
  }
  const key = new URLSearchParams(location.search).get('subject');
  const subject = findSubject(manifest, key);
  if (key !== null && !subject) {
    ui.status.textContent = 'המקצוע לא נמצא. אפשר לבחור מהרשימה:';
  } else {
    ui.status.hidden = true;
  }
  if (subject) renderSubject(subject, await media);
  else renderSubjectList(subjects, await media);
}

main();
