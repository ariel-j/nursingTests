// DOM helpers shared by the drug-cards page modules (drugs.js, drugs-review.js, drugs-games.js).
import { DRUG_FIELDS } from './drugs-core.js';
import { isolateNumberRanges as fmt } from './core.js';

export { fmt };

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className, text, onClick) {
  const b = el('button', className, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** "All families" plus each family with its drug count (alsoIn included) in a <select>. */
export function familyOptions(select, families, drugs) {
  const count = (f) => drugs.filter((d) => d.family === f || d.alsoIn.includes(f)).length;
  const all = el('option', null, `כל המשפחות (${drugs.length})`);
  all.value = '';
  select.replaceChildren(all, ...families.map((f) => {
    const option = el('option', null, `${f} (${count(f)})`);
    option.value = f;
    return option;
  }));
}

/** A drug's details as label / value rows; an unknown field shows a dash. */
export function drugRows(drug) {
  const rows = el('dl', 'drug-rows');
  for (const { key, label } of DRUG_FIELDS) {
    const value = drug[key];
    rows.append(el('dt', null, label), el('dd', value ? null : 'is-empty', value ? fmt(value) : '—'));
  }
  return rows;
}

/** Marks the answer buttons after a choice: the right one green, a wrong pick red; all disabled. */
export function markAnswer(buttons, correct, chosen) {
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === correct) b.classList.add('is-done');
    else if (i === chosen) b.classList.add('is-wrong-final');
  });
}
