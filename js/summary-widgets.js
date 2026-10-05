// Widgets shared by the interactive summaries (pharmacodynamics, parasympathetic, sympathetic): the
// reading-progress bar, search with filter pills, flip flashcards, and the small DOM helpers their
// scripts use. Each page's own script wires them to its ids and data. The article text works without
// any of this (and in all.html, which drops the [data-interactive] blocks).
import { parseRich } from './rich.js';

const $ = (id) => document.getElementById(id);

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Nodes for a marked-up string (see rich.js): bold, Latin and line breaks. */
export function rich(source) {
  return parseRich(source).map((seg) => {
    if (seg.br) return document.createElement('br');
    if (!seg.bold && !seg.en) return document.createTextNode(seg.text);
    return el(seg.bold ? 'b' : 'span', seg.en ? 'en' : '', seg.text);
  });
}

/** A block element (p, h3, div, …) holding a marked-up string. */
export function richEl(tag, className, source) {
  const node = el(tag, className);
  node.append(...rich(source));
  return node;
}

/** Pressed state for a row of toggle buttons: only `active` is pressed. */
export function setPressed(buttons, active) {
  for (const b of buttons) b.setAttribute('aria-pressed', String(b === active));
}

export function initReadingProgress() {
  const bar = $('read-progress');
  if (!bar) return;
  const update = () => {
    const root = document.documentElement;
    const max = root.scrollHeight - root.clientHeight;
    bar.style.transform = `scaleX(${max > 0 ? root.scrollTop / max : 0})`;
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

/**
 * Search box plus filter pills over the page's `.sc` cards. `matchesFilter(filter, card, text)` says
 * whether a card (with its lower-cased text) belongs to a pill's filter; 'all' is handled here.
 * Ids: `<prefix>-search`, `<prefix>-search-count`; pills are `[data-filter]` buttons.
 */
export function initSearch(prefix, matchesFilter) {
  const input = $(`${prefix}-search`);
  const counter = $(`${prefix}-search-count`);
  const pills = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('.summary .sc')];
  const sections = [...document.querySelectorAll('.summary .topic-section')];
  let filter = 'all';

  function run() {
    const query = input.value.trim().toLowerCase();
    const active = query !== '' || filter !== 'all';
    let visible = 0;
    for (const card of cards) {
      const text = card.textContent.toLowerCase();
      const show = (!query || text.includes(query)) && (filter === 'all' || matchesFilter(filter, card, text));
      card.classList.toggle('filtered-out', !show);
      if (show) visible++;
    }
    for (const sec of sections) {
      const empty = sec.querySelector('.sc:not(.filtered-out)') === null;
      sec.classList.toggle('dimmed', empty && active);
    }
    counter.textContent = active ? `נמצאו ${visible} תוצאות מתאימות` : 'מציג את כל הנושאים';
  }

  input.addEventListener('input', run);
  for (const pill of pills) {
    pill.addEventListener('click', () => {
      for (const p of pills) p.setAttribute('aria-pressed', String(p === pill));
      filter = pill.dataset.filter;
      run();
    });
  }
  // Print shows everything, whatever is filtered on screen.
  window.addEventListener('beforeprint', () => {
    for (const el of document.querySelectorAll('.filtered-out, .dimmed')) el.classList.remove('filtered-out', 'dimmed');
  });
  window.addEventListener('afterprint', run);
}

/**
 * Flip flashcards over `cards` ([{ q, a, repeats? }]), on the shared markup (ids flashcard, card-*,
 * flash-progress). An optional `#card-repeat` element shows the card's `repeats` badge ("נשאל ×3").
 * With focus inside the card area, ← goes to the next card and → to the previous (the page is RTL).
 */
export function initFlashcards(cards) {
  const card = $('flashcard');
  const num = $('card-num');
  const question = $('card-question');
  const answer = $('card-answer');
  const front = $('card-front');
  const back = $('card-back');
  const progress = $('flash-progress');
  const repeat = $('card-repeat');
  const known = new Set();
  let index = 0;

  function setFlipped(flipped) {
    card.dataset.flipped = String(flipped);
    front.setAttribute('aria-hidden', String(flipped));
    back.setAttribute('aria-hidden', String(!flipped));
  }

  function show() {
    setFlipped(false);
    const item = cards[index];
    num.textContent = `${index + 1} / ${cards.length}`;
    question.textContent = item.q;
    answer.textContent = item.a;
    if (repeat) {
      repeat.textContent = item.repeats ?? '';
      repeat.hidden = !item.repeats;
    }
    progress.textContent = `${known.size} מתוך ${cards.length} נלמדו בהצלחה`;
  }

  const go = (step) => {
    index = (index + step + cards.length) % cards.length;
    show();
  };

  card.addEventListener('click', () => setFlipped(card.dataset.flipped !== 'true'));
  $('card-prev').addEventListener('click', () => go(-1));
  $('card-next').addEventListener('click', () => go(1));
  $('card-known').addEventListener('click', () => { known.add(index); go(1); });
  $('card-again').addEventListener('click', () => { known.delete(index); go(1); });
  card.closest('.flash-stage').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(1);
    else if (e.key === 'ArrowRight') go(-1);
    else return;
    e.preventDefault();
  });
  show();
}
