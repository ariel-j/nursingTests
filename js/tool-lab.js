// Shared behaviour of the pharmacology labs (tools/hypertension.html, diuretics.html, ischemia.html,
// oncology.html, chemo.html, antibiotics-wall.html, antibiotics-dna.html, tb-viruses.html):
// the step ladder, the drug tabs, the flip cards and the sorting drill. The content is static HTML; the sorter reads
// its items from data-s = { labels, items: [[text, labelIndex, why?], …] } and runs on mountDrill.
import { mountDrill, uid } from './tool-ui.js';

function initLadder() {
  const rungs = [...document.querySelectorAll('.rung')];
  for (const rung of rungs) {
    rung.addEventListener('click', () => {
      for (const other of rungs) other.setAttribute('aria-expanded', String(other === rung));
    });
  }
}

function initTabs() {
  for (const box of document.querySelectorAll('.tabbox')) {
    const tabs = [...box.querySelectorAll('[role=tab]')];
    const panels = [...box.querySelectorAll('.drug')];
    const base = uid('tabbox');
    tabs.forEach((tab, i) => {
      tab.id = `${base}-tab-${i}`;
      tab.setAttribute('aria-controls', `${base}-panel-${i}`);
      panels[i].id = `${base}-panel-${i}`;
      panels[i].setAttribute('role', 'tabpanel');
      panels[i].setAttribute('aria-labelledby', tab.id);
    });
    const select = (index, focus) => {
      tabs.forEach((tab, i) => {
        tab.setAttribute('aria-selected', String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
        panels[i].hidden = i !== index;
      });
      if (focus) tabs[index].focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i, false));
      tab.addEventListener('keydown', (event) => {
        const step = { ArrowLeft: 1, ArrowRight: -1 }[event.key]; // RTL: left is the next tab
        if (step === undefined) return;
        event.preventDefault();
        select((i + step + tabs.length) % tabs.length, true);
      });
    });
    select(Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true')), false);
  }
}

// Flip cards (.lab-flip): a question, and its answer shown on press. Without JS the answer is just text.
function initFlips() {
  for (const flip of document.querySelectorAll('.lab-flip')) {
    const detail = flip.querySelector('.flip-detail');
    const set = (open) => {
      flip.setAttribute('aria-expanded', String(open));
      detail.hidden = !open;
    };
    set(false);
    flip.addEventListener('click', () => set(flip.getAttribute('aria-expanded') !== 'true'));
  }
}

function initSorters() {
  for (const root of document.querySelectorAll('.sorter')) {
    const { labels, items } = JSON.parse(root.dataset.s);
    mountDrill(root, {
      label: 'משחק מיון: לאיזו קבוצה שייך כל פריט',
      items: items.map(([prompt, correct, why]) => ({ prompt, options: labels, correct, why })),
    });
  }
}

export function initLab() {
  initLadder();
  initTabs();
  initFlips();
  initSorters();
}
