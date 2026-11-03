// Summaries hub (summaries/index.html): one card per summary, grouped by subject.
import { SUMMARIES, summaryFile } from './summary-list.js';

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
  if (summary.unit) link.append(el('p', 'kicker', summary.unit));
  link.append(el('h3', null, summary.title), el('p', 'muted', summary.blurb));
  item.append(link);
  return item;
}

function renderGroup(subject, summaries) {
  const group = el('section', 'summary-group');
  group.append(el('h2', null, subject));
  const list = el('ul', 'summary-list');
  list.append(...summaries.map(renderCard));
  group.append(list);
  return group;
}

// Subjects in the order their first summary appears in the list.
const subjects = [...new Set(SUMMARIES.map((s) => s.subject))];
document.getElementById('summary-groups').replaceChildren(
  ...subjects.map((name) => renderGroup(name, SUMMARIES.filter((s) => s.subject === name))),
);
