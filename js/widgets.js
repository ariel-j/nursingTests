// Small interactive widgets for the summaries (practice drills, filters). DOM only through
// createElement / textContent, never innerHTML. Pages import what they need.
import { isolateNumberRanges, shuffle } from './core.js';

const text = (value) => isolateNumberRanges(value);

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let nextId = 0;
const uid = (prefix) => `${prefix}-${++nextId}`;

/**
 * One-question-at-a-time drill. items: [{ prompt, options: [string], answer: index, note? }].
 * With `shuffleOptions` the options are reshuffled on every display. Answering shows feedback and a
 * "next" button (nothing advances by itself); the end shows the score and a restart button.
 */
export function mountDrill(root, { items, shuffleOptions = false, rng = Math.random }) {
  let index = 0;
  let correct = 0;
  let streak = 0;
  let answered = false;

  const count = el('p', 'drill-count');
  const prompt = el('p', 'drill-prompt');
  prompt.id = uid('drill-q');
  const options = el('div', 'drill-options');
  options.setAttribute('role', 'group');
  options.setAttribute('aria-labelledby', prompt.id);
  const feedback = el('p', 'drill-feedback');
  feedback.setAttribute('role', 'status');
  const next = el('button', 'secondary drill-next');
  next.type = 'button';
  next.hidden = true;

  function finish() {
    const done = el('p', 'drill-prompt', `סיימתם: ${correct} נכון מתוך ${items.length}.`);
    done.setAttribute('role', 'status');
    const again = el('button', 'secondary', 'עוד סיבוב');
    again.type = 'button';
    again.addEventListener('click', () => {
      index = 0; correct = 0; streak = 0;
      root.replaceChildren(count, prompt, options, feedback, next);
      show();
      options.querySelector('button')?.focus();
    });
    root.replaceChildren(done, again);
    again.focus();
  }

  function show() {
    const item = items[index];
    answered = false;
    count.textContent = `${index + 1} מתוך ${items.length} · נכון עד כה: ${correct} · רצף: ${streak}`;
    prompt.textContent = text(item.prompt);
    feedback.textContent = '';
    feedback.className = 'drill-feedback';
    next.hidden = true;
    const order = item.options.map((option, i) => [option, i]);
    const shown = shuffleOptions ? shuffle(order, rng) : order;
    options.replaceChildren(...shown.map(([option, i]) => {
      const btn = el('button', 'drill-option', text(option));
      btn.type = 'button';
      btn.addEventListener('click', () => choose(btn, i, shown));
      btn.dataset.index = String(i);
      return btn;
    }));
  }

  function choose(btn, picked, shown) {
    if (answered) return;
    answered = true;
    const item = items[index];
    const ok = picked === item.answer;
    if (ok) { correct++; streak++; } else { streak = 0; }
    for (const b of options.children) {
      b.setAttribute('aria-disabled', 'true');
      if (Number(b.dataset.index) === item.answer) b.classList.add('is-correct');
    }
    if (!ok) btn.classList.add('is-wrong');
    const note = item.note ? ` ${text(item.note)}` : '';
    feedback.textContent = ok
      ? `נכון.${note}`
      : `לא נכון. התשובה: ${text(item.options[item.answer])}.${note}`;
    feedback.className = `drill-feedback ${ok ? 'ok' : 'no'}`;
    next.textContent = index === items.length - 1 ? 'סיום' : 'הבאה';
    next.hidden = false;
    next.focus();
  }

  next.addEventListener('click', () => {
    if (index === items.length - 1) { finish(); return; }
    index++;
    show();
    options.querySelector('button')?.focus();
  });

  root.replaceChildren(count, prompt, options, feedback, next);
  show();
}

/** A group of radio buttons styled as chips. onChange(value) runs when the choice changes. */
export function mountChips(root, { legend, values, onChange }) {
  const set = el('fieldset', 'chips');
  set.append(el('legend', null, legend));
  const name = uid('chips');
  values.forEach((value, i) => {
    const label = el('label');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.checked = i === 0;
    input.addEventListener('change', () => onChange(value));
    label.append(input, el('span', null, value));
    set.append(label);
  });
  root.replaceChildren(set);
}
