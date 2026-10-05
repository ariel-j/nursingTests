// Widgets shared by the interactive summaries (pharmacodynamics.html, parasympathetic.html): the
// reading-progress bar, search with filter pills, and flip flashcards. Each page's own script wires
// them to its ids and data. The article text works without any of this (and in all.html, which drops
// the [data-interactive] blocks).

const $ = (id) => document.getElementById(id);

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

/** Flip flashcards over `cards` ([{ q, a }]), on the shared markup (ids flashcard, card-*, flash-progress). */
export function initFlashcards(cards) {
  const card = $('flashcard');
  const num = $('card-num');
  const question = $('card-question');
  const answer = $('card-answer');
  const front = $('card-front');
  const back = $('card-back');
  const progress = $('flash-progress');
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
  show();
}
