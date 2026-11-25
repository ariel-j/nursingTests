// DOM helpers shared by the interactive tool pages. Everything is built with the DOM API and
// textContent, never innerHTML. Feedback goes through a polite live region and focus moves to
// the next control, so the tools work with a keyboard and a screen reader.
import { shuffle } from './core.js';
import { optionOrder } from './tool-core.js';

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let nextId = 0;
export const uid = (prefix) => `${prefix}-${++nextId}`;

/**
 * A question-by-question drill inside `root`.
 *   items          [{ prompt, options, correct, why? }]
 *   label          accessible name of the drill
 *   shuffleOptions reshuffle the options on every display (the quiz); drills with meaningful
 *                  button order (e.g. 'allowed / with a nurse / forbidden') keep it fixed
 * The order of the questions is shuffled on every round. After the last one a result is shown
 * with a button to start again. Nothing advances on a timer.
 */
export function mountDrill(root, { items, label, shuffleOptions = false, rng = Math.random }) {
  root.classList.add('drill');
  const meta = el('p', 'drill-meta');
  const prompt = el('p', 'drill-prompt');
  prompt.id = uid('drill-prompt');
  prompt.tabIndex = -1;
  const options = el('div', 'options');
  options.setAttribute('role', 'group');
  options.setAttribute('aria-labelledby', prompt.id);
  const feedback = el('p', 'drill-feedback');
  feedback.setAttribute('role', 'status');
  const next = el('button', 'primary');
  next.type = 'button';
  next.hidden = true;
  root.setAttribute('aria-label', label);
  root.replaceChildren(meta, prompt, options, feedback, next);

  let order = [];
  let position = 0;
  let correct = 0;
  let streak = 0;
  let answered = false;
  let onNext = () => {};
  next.addEventListener('click', () => onNext());

  function showMeta() {
    const parts = [`שאלה ${position + 1} מתוך ${order.length}`, `נכון: ${correct}`];
    if (streak > 1) parts.push(`רצף: ${streak}`);
    meta.textContent = parts.join(' · ');
  }

  function start() {
    order = shuffle(items.map((_, i) => i), rng);
    position = 0;
    correct = 0;
    streak = 0;
    show(false);
  }

  function show(moveFocus = true) {
    const item = items[order[position]];
    answered = false;
    showMeta();
    prompt.textContent = item.prompt;
    feedback.textContent = '';
    feedback.className = 'drill-feedback';
    next.hidden = true;
    const buttons = optionOrder(item, rng, shuffleOptions).map((index) => {
      const button = el('button', 'option');
      button.type = 'button';
      button.append(el('span', 'option-text', item.options[index]));
      button.dataset.index = String(index);
      button.addEventListener('click', () => choose(item, index, button, buttons));
      return button;
    });
    options.replaceChildren(...buttons);
    if (moveFocus) prompt.focus();
  }

  function choose(item, index, chosen, buttons) {
    if (answered) return;
    answered = true;
    const right = index === item.correct;
    correct += right ? 1 : 0;
    streak = right ? streak + 1 : 0;
    buttons.forEach((button) => {
      button.disabled = true;
      if (Number(button.dataset.index) === item.correct) button.classList.add('is-correct');
      else if (button === chosen) button.classList.add('is-wrong');
      else button.classList.add('is-dim');
    });
    const lead = right ? 'נכון.' : `לא. התשובה: ${item.options[item.correct]}.`;
    feedback.textContent = item.why ? `${lead} ${item.why}` : lead;
    feedback.className = `drill-feedback ${right ? 'ok' : 'no'}`;
    showMeta();
    const last = position === order.length - 1;
    next.textContent = last ? 'סיום' : 'הבאה';
    next.hidden = false;
    onNext = last ? finish : advance;
    next.focus();
  }

  function advance() {
    position += 1;
    show();
  }

  function finish() {
    meta.textContent = 'סיימת';
    prompt.textContent = `ענית נכון על ${correct} מתוך ${order.length}.`;
    options.replaceChildren();
    feedback.textContent = '';
    feedback.className = 'drill-feedback';
    next.textContent = 'מההתחלה';
    onNext = () => {
      start();
      prompt.focus();
    };
    prompt.focus();
  }

  start();
}

/** A radio group rendered as chips: `<fieldset>` + legend, options as `<label>` pills. */
export function chipGroup(legendText, names, selected, onChange) {
  const set = el('fieldset', 'chips');
  set.append(el('legend', 'sr-only', legendText));
  const name = uid('chips');
  for (const text of names) {
    const label = el('label', 'chip-label');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.checked = text === selected;
    input.addEventListener('change', () => onChange(text));
    label.append(input, el('span', null, text));
    set.append(label);
  }
  return set;
}
