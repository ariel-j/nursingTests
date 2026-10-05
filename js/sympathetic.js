// Sympathetic summary (summaries/sympathetic.html): the interactive parts around the static text: the
// receptor explorer, the self-test mode over the cause → effect rows, and the "chapter done" tracker.
// Search, flashcards and the progress bar are shared (summary-widgets.js). The article's text works without
// any of this (and in all.html, which drops the [data-interactive] blocks), so each widget's facts also
// appear in the static sections.
// Text data and the pure progress logic live in sympathetic-data.js; text goes in with textContent and DOM
// nodes, never innerHTML.
import { RECEPTORS, FLASHCARDS, studyProgress, toggleDone } from './sympathetic-data.js';
import { el, rich, richEl, setPressed, initReadingProgress, initSearch, initFlashcards } from './summary-widgets.js';
import { load, save, remove } from './storage.js';

const $ = (id) => document.getElementById(id);
const DONE_KEY = 'summary:sympathetic:done';

// ---------- search filters ----------

const inCategory = (card, cat) => card.closest(`[data-category="${cat}"]`) !== null;
function matchesFilter(filter, card, text) {
  switch (filter) {
    case 'exam': return card.classList.contains('is-exam') || text.includes('נשאל');
    case 'agonists': return inCategory(card, 'agonists') || text.includes('אגוניסט');
    case 'antagonists': return inCategory(card, 'antagonists') || text.includes('חוסם');
    case 'traps': return text.includes('מלכוד') || text.includes('ת"ל') || text.includes('אסור') || text.includes('התוויית נגד') || text.includes('סכנה');
    case 'rel': return inCategory(card, 'rel') || text.includes('←');
    default: return true;
  }
}

// ---------- receptor explorer ----------

function initReceptors() {
  const container = $('receptor-detail');
  const buttons = [...document.querySelectorAll('[data-receptor]')];

  function infoCard(title, tone) {
    const card = el('div', 'pcard');
    if (tone) card.dataset.tone = tone;
    card.append(el('h4', null, title));
    return card;
  }

  function render(key) {
    const r = RECEPTORS.find((item) => item.key === key);

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
  render(RECEPTORS[0].key);
}

// ---------- self-test mode over the cause → effect rows ----------

function initSelfTest() {
  const rows = [...$('sy-chains').querySelectorAll('.rel')];
  const toggle = $('selftest-toggle');
  const status = $('selftest-status');
  let on = false;

  const hiddenCount = () => rows.filter((r) => r.classList.contains('is-hidden')).length;

  function updateStatus() {
    if (!on) status.textContent = '';
    else if (hiddenCount() === 0) status.textContent = 'כל התוצאות נחשפו.';
    else status.textContent = `${hiddenCount()} תוצאות מוסתרות. לחצו על שורה (או Enter) כדי לחשוף את התוצאה.`;
  }

  function hide(row) {
    row.classList.add('is-hidden');
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.setAttribute('aria-label', `חשוף את התוצאה: ${row.querySelector('.rel-cause').textContent.trim()}`);
    // The effect's text is blurred through a wrapper (it is bare text nodes mixed with <b>/<span>).
    const effect = row.querySelector('.rel-effect');
    const blurred = el('span', 'rel-blur');
    blurred.append(...effect.childNodes);
    effect.append(blurred, el('span', 'rel-hint', 'לחצו לחשיפת התוצאה 👁️'));
  }

  function reveal(row) {
    row.classList.remove('is-hidden');
    row.removeAttribute('role');
    row.removeAttribute('tabindex');
    row.removeAttribute('aria-label');
    const blurred = row.querySelector('.rel-blur');
    if (blurred) row.querySelector('.rel-effect').replaceChildren(...blurred.childNodes);
  }

  function setMode(next) {
    on = next;
    for (const row of rows) {
      if (on) { if (!row.classList.contains('is-hidden')) hide(row); } else reveal(row);
    }
    toggle.setAttribute('aria-pressed', String(on));
    toggle.replaceChildren(
      el('span', null, on ? '🔒' : '👁️'),
      document.createTextNode(on ? ' מצב בחינה פעיל (לחצו לביטול)' : ' מצב בחינה עצמית (הסתר תוצאות)'),
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
    status.textContent = 'כל התוצאות נחשפו.';
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

// ---------- "chapter done" tracker ----------

function initTracker() {
  const sections = [...document.querySelectorAll('.summary .topic-section')];
  const ids = sections.map((s) => s.id);
  const bar = $('sy-bar');
  const fill = $('sy-fill');
  let done = studyProgress(load(DONE_KEY, []), ids).done;
  const boxes = new Map();

  function render() {
    const { count, total, percent } = studyProgress(done, ids);
    fill.style.inlineSize = `${percent}%`;
    bar.setAttribute('aria-valuenow', String(percent));
    $('sy-percent').textContent = `${percent}%`;
    $('sy-count').textContent = `${count} מתוך ${total} פרקים הושלמו`;
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
      save(DONE_KEY, done);
      render();
    });
  }

  $('sy-reset').addEventListener('click', () => {
    done = [];
    remove(DONE_KEY);
    render();
  });
  render();
}

initReadingProgress();
initSearch('sy', matchesFilter);
initReceptors();
initSelfTest();
initTracker();
initFlashcards(FLASHCARDS);
