// Summaries hub (summaries/index.html): one card per summary.
import { loadSummaries, summaryFile } from './summary-list.js';

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
  return item;
}

const listEl = document.getElementById('summary-list');
loadSummaries().then(
  (summaries) => listEl.replaceChildren(...summaries.map(renderCard)),
  () => listEl.replaceChildren(el('li', 'muted', 'לא הצלחנו לטעון את רשימת הסיכומים.')),
);
