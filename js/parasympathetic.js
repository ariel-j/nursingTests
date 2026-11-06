// Parasympathetic summary (summaries/parasympathetic.html): the interactive parts around the static
// text: the organ simulator (activation vs. muscarinic block), the six-step synapse explorer and the
// NMJ comparison (competitive vs. depolarizing block). Search, flashcards and the progress bar are shared
// (summary-widgets.js). The article's text works without any of this (and in all.html, which drops the
// [data-interactive] blocks), so each widget's facts also appear in the static sections.
// Text data lives in parasympathetic-data.js, the markup parser in rich.js; text goes in with textContent
// and DOM nodes, never innerHTML.
import { ORGAN_MODES, SYNAPSE_STEPS, NMJ, FLASHCARDS } from './parasympathetic-data.js';
import { el, rich, richEl, setPressed, initReadingProgress, initSearch, initFlashcards } from './summary-widgets.js';

const $ = (id) => document.getElementById(id);

// ---------- search filters ----------

const inCategory = (card, cat) => card.closest(`[data-category="${cat}"]`) !== null;
function matchesFilter(filter, card, text) {
  switch (filter) {
    case 'exam': return card.classList.contains('is-exam') || text.includes('נשאל');
    case 'agonists': return inCategory(card, 'agonists') || text.includes('אגוניסט') || text.includes('מעכב ache');
    case 'antagonists': return inCategory(card, 'antagonists') || text.includes('אנטגוניסט') || text.includes('חוסמי');
    case 'traps': return text.includes('מלכוד') || text.includes('סכנה') || text.includes('אסור');
    case 'rel': return inCategory(card, 'rel') || text.includes('←');
    default: return true;
  }
}

// ---------- organ simulator ----------

function initOrgans() {
  const container = $('organ-cards');
  const buttons = [...document.querySelectorAll('[data-organ-mode]')];

  function render(mode) {
    const cards = ORGAN_MODES[mode].map((item) => {
      const card = el('div', 'organ-card');
      card.dataset.tone = mode === 'cholinergic' ? 'emerald' : 'rose';
      const top = el('div', 'organ-top');
      const icon = el('span', 'organ-icon', item.icon);
      icon.setAttribute('aria-hidden', 'true');
      top.append(icon, richEl('span', 'organ-badge', item.badge));
      card.append(top, richEl('h3', null, item.title), richEl('p', 'organ-desc', item.desc), richEl('div', 'organ-drug', item.drug));
      return card;
    });
    container.replaceChildren(...cards);
  }

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      setPressed(buttons, btn);
      render(btn.dataset.organMode);
    });
  }
  render('cholinergic');
}

// ---------- synapse explorer ----------

function initSynapse() {
  const display = $('synapse-display');
  const buttons = [...document.querySelectorAll('[data-step]')];

  function render(index) {
    const step = SYNAPSE_STEPS[index];
    const head = el('div', 'syn-head');
    head.append(el('span', 'syn-num', `שלב ${index + 1} מתוך ${SYNAPSE_STEPS.length}`), el('span', 'syn-kind', 'מנגנון סינפטי'));

    const targets = el('div', 'syn-box');
    targets.append(el('b', 'syn-label', '🎯 תרופות ורעלים פעילים:'), ...rich(step.targets));
    const alert = el('div', 'syn-box syn-alert');
    alert.append(el('b', 'syn-label', '💡 דגש לבחינה:'), ...rich(step.alert));
    const grid = el('div', 'syn-grid');
    grid.append(targets, alert);

    display.replaceChildren(head, richEl('h3', null, step.title), richEl('p', 'syn-desc', step.desc), grid);
  }

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      setPressed(buttons, btn);
      render(Number(btn.dataset.step) - 1);
    });
  }
  render(0);
}

// ---------- NMJ battle ----------

function initNmj() {
  const toggle = $('nmj-toggle');
  const boxes = { curare: $('curare-status'), succ: $('succ-status') };
  let injected = false;

  function render() {
    const state = injected ? NMJ.injected : NMJ.start;
    toggle.replaceChildren(...rich(state.button));
    toggle.setAttribute('aria-pressed', String(injected));
    for (const [key, box] of Object.entries(boxes)) {
      if (injected) box.dataset.tone = key === 'curare' ? 'emerald' : 'rose';
      else delete box.dataset.tone;
      const lead = el('b', 'nmj-lead');
      lead.append(...rich(state[key].lead));
      box.replaceChildren(lead, ...rich(state[key].text));
    }
  }

  toggle.addEventListener('click', () => {
    injected = !injected;
    render();
  });
  render();
}

initReadingProgress();
initSearch('ps', matchesFilter);
initOrgans();
initSynapse();
initNmj();
initFlashcards(FLASHCARDS);
