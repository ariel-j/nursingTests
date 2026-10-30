// Summaries hub (summaries/index.html): one card per summary, grouped by subject.
import { bySubject, studyFile, summaryFile } from './summary-list.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderCard(summary) {
  const item = el('li');
  const link = el('a', 'quiz-card summary-card');
  link.href = summaryFile(summary.id);
  link.dataset.system = summary.id;
  link.append(el('h2', null, summary.title), el('p', 'muted', summary.blurb));
  item.append(link);
  if (summary.study) {
    const practice = el('a', 'study-link', 'תרגול אינטראקטיבי ←');
    practice.href = studyFile(summary.id);
    practice.dataset.system = summary.id;
    item.append(practice);
  }
  return item;
}

const root = document.getElementById('summary-list');
root.replaceChildren(...bySubject().flatMap(({ subject, items }) => {
  const heading = el('li', 'subject-heading');
  heading.append(el('h2', null, subject));
  return [heading, ...items.map(renderCard)];
}));
