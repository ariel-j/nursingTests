// Widgets shared by the interactive summaries (pharmacodynamics, parasympathetic, sympathetic, opioids, the
// pharma-git / pharma-respiratory / pharma-immunosuppression pages and the others): the
// reading-progress bar, search with filter pills, flip flashcards, the cause → effect self-test, the
// "chapter done" tracker, the receptor explorer, and the small DOM helpers their scripts use. Each page's own script wires them to its ids and data. The article text works without
// any of this (and in all.html, which drops the [data-interactive] blocks).
import { parseRich } from './rich.js';
import { studyProgress, toggleDone } from './study-progress.js';
import { load, save, remove } from './storage.js';

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
 * The filter pills of the plain study pages (all / exam recalls / traps / cause → effect), for
 * `initSearch`: exam rows carry `is-exam` or an exam badge, traps are `.call` blocks.
 */
export function studyFilter(filter, card, text) {
  switch (filter) {
    case 'exam': return card.classList.contains('is-exam') || text.includes('נשאל');
    case 'traps': return card.classList.contains('call');
    case 'rel': return card.classList.contains('rel');
    default: return true;
  }
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

/**
 * Self-test mode over the cause → effect rows inside `#<chainsId>`: hides each row's result until the reader
 * opens it. Needs `#selftest-toggle`, `#selftest-reveal` and `#selftest-status`.
 * With `{ all: true }` (chainsId is then ignored) it covers every chapter's cause → effect rows and
 * definitions (`dl.def`: the explanation is hidden, the term stays), not the glossary.
 */
export function initSelfTest(chainsId, { all = false } = {}) {
  const rows = all
    ? [...document.querySelectorAll('.summary .topic-section .rel, .summary .topic-section dl.def')]
    : [...$(chainsId).querySelectorAll('.rel')];
  const toggle = $('selftest-toggle');
  const status = $('selftest-status');
  let on = false;

  const hiddenCount = () => rows.filter((r) => r.classList.contains('is-hidden')).length;

  function updateStatus() {
    if (!on) status.textContent = '';
    else if (hiddenCount() === 0) status.textContent = all ? 'כל הפריטים נחשפו.' : 'כל התוצאות נחשפו.';
    else if (all) status.textContent = `${hiddenCount()} פריטים מוסתרים. לחצו על פריט (או Enter) כדי לחשוף אותו.`;
    else status.textContent = `${hiddenCount()} תוצאות מוסתרות. לחצו על שורה (או Enter) כדי לחשוף את התוצאה.`;
  }

  function hide(row) {
    row.classList.add('is-hidden');
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    const label = row.querySelector('.rel-cause, dt').textContent.trim();
    row.setAttribute('aria-label', all ? `חשוף את ההסבר: ${label}` : `חשוף את התוצאה: ${label}`);
    // The effect's text is blurred through a wrapper (it is bare text nodes mixed with <b>/<span>).
    const effect = row.querySelector('.rel-effect, dd');
    const blurred = el('span', 'rel-blur');
    blurred.append(...effect.childNodes);
    effect.append(blurred, el('span', 'rel-hint', all ? 'לחצו לחשיפה 👁️' : 'לחצו לחשיפת התוצאה 👁️'));
  }

  function reveal(row) {
    row.classList.remove('is-hidden');
    row.removeAttribute('role');
    row.removeAttribute('tabindex');
    row.removeAttribute('aria-label');
    const blurred = row.querySelector('.rel-blur');
    if (blurred) row.querySelector('.rel-effect, dd').replaceChildren(...blurred.childNodes);
  }

  function setMode(next) {
    on = next;
    for (const row of rows) {
      if (on) { if (!row.classList.contains('is-hidden')) hide(row); } else reveal(row);
    }
    toggle.setAttribute('aria-pressed', String(on));
    toggle.replaceChildren(
      el('span', null, on ? '🔒' : '👁️'),
      document.createTextNode(on ? ' מצב בחינה פעיל (לחצו לביטול)' : ` מצב בחינה עצמית (הסתר ${all ? 'תוצאות והגדרות' : 'תוצאות'})`),
    );
    toggle.firstChild.setAttribute('aria-hidden', 'true');
    updateStatus();
  }

  function revealOne(row) {
    reveal(row);
    updateStatus();
  }

  toggle.addEventListener('click', () => setMode(!on));
  $('selftest-reveal').addEventListener('click', () => {
    setMode(false);
    status.textContent = all ? 'כל הפריטים נחשפו.' : 'כל התוצאות נחשפו.';
  });
  for (const row of rows) {
    row.addEventListener('click', () => { if (row.classList.contains('is-hidden')) revealOne(row); });
    row.addEventListener('keydown', (e) => {
      if (e.target !== row || !row.classList.contains('is-hidden')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        revealOne(row);
      }
    });
  }
  // Print shows every result, whatever is hidden on screen.
  window.addEventListener('beforeprint', () => { if (on) setMode(false); });
}

/**
 * "Chapter done" marks on every `.topic-section` plus the progress tracker (ids `<prefix>-bar`, `-fill`,
 * `-percent`, `-count`, `-reset`). The marks are kept in storage under `doneKey`.
 */
export function initTracker(prefix, doneKey) {
  const sections = [...document.querySelectorAll('.summary .topic-section')];
  const ids = sections.map((s) => s.id);
  const bar = $(`${prefix}-bar`);
  const fill = $(`${prefix}-fill`);
  let done = studyProgress(load(doneKey, []), ids).done;
  const boxes = new Map();

  function render() {
    const { count, total, percent } = studyProgress(done, ids);
    fill.style.inlineSize = `${percent}%`;
    bar.setAttribute('aria-valuenow', String(percent));
    $(`${prefix}-percent`).textContent = `${percent}%`;
    $(`${prefix}-count`).textContent = `${count} מתוך ${total} פרקים הושלמו`;
    for (const [id, box] of boxes) box.checked = done.includes(id);
  }

  for (const section of sections) {
    const label = el('label', 'done-mark no-print');
    const box = el('input');
    box.type = 'checkbox';
    const hidden = el('span', 'visually-hidden', `: ${section.querySelector('h2').textContent}`);
    label.append(box, document.createTextNode(' סמן כהושלם'), hidden);
    section.append(label);
    boxes.set(section.id, box);
    box.addEventListener('change', () => {
      done = toggleDone(done, section.id, box.checked, ids);
      save(doneKey, done);
      render();
    });
  }

  $(`${prefix}-reset`).addEventListener('click', () => {
    done = [];
    remove(doneKey);
    render();
  });
  render();
}

/**
 * Receptor explorer: one button per `[data-receptor]`, the detail card goes into `#receptor-detail`.
 * `receptors` is [{ key, g, tone, title, pathway, organs, effects[], agonists, antagonists, pearl }] (rich.js text).
 */
export function initReceptors(receptors) {
  const container = $('receptor-detail');
  const buttons = [...document.querySelectorAll('[data-receptor]')];

  function infoCard(title, tone) {
    const card = el('div', 'pcard');
    if (tone) card.dataset.tone = tone;
    card.append(el('h4', null, title));
    return card;
  }

  function render(key) {
    const r = receptors.find((item) => item.key === key);

    const head = el('div', 'rc-head');
    const g = el('span', 'tag');
    g.dataset.tone = r.tone;
    g.append(...rich('חלבון צימוד: `' + r.g + '`'));
    head.append(richEl('h3', null, r.title), g);

    const pathway = el('div', 'rc-pathway');
    pathway.append(el('b', 'rc-label', '⚡ מנגנון התמרה תוך-תאי:'), richEl('p', 'flush', r.pathway));

    const organs = infoCard('📍 איברי מטרה ומיקום ברקמות');
    organs.append(richEl('p', 'flush', r.organs));
    const effects = infoCard('🎯 השפעות פיזיולוגיות עיקריות');
    const list = el('ul', 'flush');
    for (const text of r.effects) list.append(richEl('li', null, text));
    effects.append(list);

    const agonists = infoCard('🟢 אגוניסטים מרכזיים (מפעילים)', 'emerald');
    agonists.append(richEl('p', 'flush', r.agonists));
    const antagonists = infoCard('🔴 אנטגוניסטים מרכזיים (חוסמים)', 'rose');
    antagonists.append(richEl('p', 'flush', r.antagonists));

    const pearl = el('div', 'call');
    pearl.append(el('h4', null, '💡 דגש קליני למבחן'), richEl('p', 'flush', r.pearl));

    const where = el('div', 'cards c2');
    where.append(organs, effects);
    const drugs = el('div', 'cards c2');
    drugs.append(agonists, antagonists);
    container.replaceChildren(head, pathway, where, drugs, pearl);
  }

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      setPressed(buttons, btn);
      render(btn.dataset.receptor);
    });
  }
  render(receptors[0].key);
}

/**
 * Generic explorer for pages whose items are not receptors (an enzyme pathway, the coagulation steps): one
 * button per `[data-receptor]`, the detail goes into `#receptor-detail` and reuses the receptor look.
 * `items` is [{ key, tone, tag, title, lead: { label, text }, boxes: [{ title, tone?, text }], pearl }]
 * (rich.js text; the labels and box titles are plain). The facts must also be in the page's static text.
 */
export function initExplorer(items) {
  const container = $('receptor-detail');
  const buttons = [...document.querySelectorAll('[data-receptor]')];

  function render(key) {
    const item = items.find((i) => i.key === key);

    const head = el('div', 'rc-head');
    const tag = el('span', 'tag');
    tag.dataset.tone = item.tone;
    tag.append(...rich(item.tag));
    head.append(richEl('h3', null, item.title), tag);

    const lead = el('div', 'rc-pathway');
    lead.append(el('b', 'rc-label', item.lead.label), richEl('p', 'flush', item.lead.text));

    const grid = el('div', 'cards c2');
    for (const box of item.boxes) {
      const card = el('div', 'pcard');
      if (box.tone) card.dataset.tone = box.tone;
      card.append(el('h4', null, box.title), richEl('p', 'flush', box.text));
      grid.append(card);
    }

    const pearl = el('div', 'call');
    pearl.append(el('h4', null, '💡 דגש קליני למבחן'), richEl('p', 'flush', item.pearl));
    container.replaceChildren(head, lead, grid, pearl);
  }

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      setPressed(buttons, btn);
      render(btn.dataset.receptor);
    });
  }
  render(items[0].key);
}
