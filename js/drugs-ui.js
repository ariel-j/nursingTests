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

/** Whether the learner asked for less motion (toolbar's stop-motion or the system setting). */
export function lessMotion() {
  return document.documentElement.dataset.motion === 'off'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A short vibration on phones that support it (not iPhone); never with less motion. */
export function buzz(ms = 120) {
  if (lessMotion()) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // vibration is a nicety
  }
}

/** "★★☆" with a text alternative. */
export function starsEl(count, className = 'game-stars') {
  const node = el('p', className, '★'.repeat(count) + '☆'.repeat(3 - count));
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', `${count} מתוך 3 כוכבים`);
  return node;
}
