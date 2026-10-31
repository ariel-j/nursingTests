// The explanation shown for a drug: after a match, after a speed answer and in the collection.
import { drugName, el } from './memory-dom.js';

export function drugDetail(drug, { headingTag = 'h3', headingId } = {}) {
  const box = document.createDocumentFragment();

  const heading = el(headingTag, 'detail-name');
  if (headingId) heading.id = headingId;
  heading.append(drugName(drug.name));
  const family = el('p', 'detail-family', drug.family);

  const use = el('p', 'detail-use');
  use.append(el('span', 'detail-label', '🩺 שימושים: '), document.createTextNode(drug.indication));

  const explanation = el('p', 'detail-explanation', drug.explanation);

  const effects = el('details', 'detail-effects');
  effects.open = true;
  effects.append(el('summary', null, 'תופעות לוואי'));
  const list = el('ul');
  for (const text of drug.sideEffects) list.append(el('li', null, text));
  effects.append(list);

  box.append(heading, family, use, explanation, effects);
  return box;
}
