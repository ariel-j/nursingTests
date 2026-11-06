// Labs hub (labs/index.html): one card per lab, linking to the lab and to its full quiz.
import { LABS, labFile } from './lab-list.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderCard(lab) {
  const item = el('li');
  const link = el('a', 'quiz-card');
  link.href = labFile(lab.id);
  link.dataset.lab = lab.id;
  link.append(el('h2', null, lab.title), el('p', 'muted', lab.blurb));
  const quiz = el('a', 'link-button', 'לבוחן המלא');
  quiz.href = `../quiz.html?id=${encodeURIComponent(lab.quiz)}`;
  item.append(link, quiz);
  return item;
}

document.getElementById('lab-list').replaceChildren(...LABS.map(renderCard));
