// Labs hub (labs/index.html): one card per lab.
import { LABS, labFile } from './lab-list.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderCard(lab) {
  const item = el('li');
  const link = el('a', 'quiz-card lab-card');
  link.href = labFile(lab.id);
  link.append(el('h2', null, lab.title), el('p', 'muted', lab.blurb));
  item.append(link);
  return item;
}

document.getElementById('lab-list').replaceChildren(...LABS.map(renderCard));
