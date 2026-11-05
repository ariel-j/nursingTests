// Interactive lab pages (labs/<id>.html): the step ladder, drug tabs and the sorting game.
// Content is static HTML; this only wires behaviour. XP and streak are kept per lab.
import { load, save } from './storage.js';

const labId = document.querySelector('[data-lab]')?.dataset.lab ?? 'lab';
const XP_KEY = `lab:${labId}:xp`;

let xp = Number(load(XP_KEY, 0)) || 0;
let streak = 0;

function showStats() {
  document.getElementById('xp').textContent = String(xp);
  document.getElementById('streak').textContent = String(streak);
}

/** A correct answer is worth 10 XP, plus 5 once the streak reaches 3. */
function award(correct) {
  if (correct) {
    streak += 1;
    xp += 10 + (streak >= 3 ? 5 : 0);
  } else {
    streak = 0;
  }
  save(XP_KEY, xp);
  showStats();
}

const shuffled = (list) => {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

function button(className, text, onClick) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  node.addEventListener('click', onClick);
  return node;
}

// ---------- step ladder: one step open at a time ----------
const rungs = [...document.querySelectorAll('.rung')];
for (const rung of rungs) {
  rung.addEventListener('click', () => {
    for (const other of rungs) other.setAttribute('aria-expanded', String(other === rung));
  });
}

// ---------- tabs ----------
let tabCount = 0;
for (const box of document.querySelectorAll('.tabbox')) {
  const tabs = [...box.querySelectorAll('[role=tab]')];
  const panels = [...box.querySelectorAll('.drug')];
  const base = `tabbox-${tabCount++}`;
  tabs.forEach((tab, i) => {
    tab.id = `${base}-tab-${i}`;
    tab.setAttribute('aria-controls', `${base}-panel-${i}`);
  });
  panels.forEach((panel, i) => {
    panel.id = `${base}-panel-${panels.indexOf(panel)}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tabs[i]?.id ?? '');
  });
  const select = (tab, focus) => {
    for (const other of tabs) {
      other.setAttribute('aria-selected', String(other === tab));
      other.tabIndex = other === tab ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.dataset.i !== tab.dataset.i;
    if (focus) tab.focus();
  };
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => select(tab, false));
    tab.addEventListener('keydown', (event) => {
      const step = { ArrowLeft: 1, ArrowRight: -1 }[event.key]; // RTL: left = next
      if (step === undefined) return;
      event.preventDefault();
      select(tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length], true);
    });
  });
  select(tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0], false);
}

// ---------- sorting game ----------
for (const root of document.querySelectorAll('.sorter')) {
  const { labels, items: source } = JSON.parse(root.dataset.s);
  const question = root.querySelector('.sort-q');
  const choices = root.querySelector('.sort-btns');
  const verdict = root.querySelector('.verdict');
  const progress = root.querySelector('.sort-prog');
  verdict.setAttribute('role', 'status');

  let items = shuffled(source);
  let index = 0;
  let right = 0;

  function draw() {
    verdict.hidden = true;
    if (index >= items.length) {
      question.textContent = `סיימת: ${right} מתוך ${items.length}`;
      choices.replaceChildren(button('btn primary', 'שוב', () => {
        items = shuffled(source);
        index = 0;
        right = 0;
        draw();
      }));
      progress.textContent = '';
      return;
    }
    const [text, answer, why] = items[index];
    question.textContent = text;
    choices.replaceChildren(...labels.map((label, k) => button('btn', label, () => {
      const good = k === answer;
      if (good) right += 1;
      award(good);
      verdict.hidden = false;
      verdict.className = `verdict ${good ? 'v-good' : 'v-bad'}`;
      verdict.textContent = (good ? 'נכון. ' : `לא נכון. התשובה: ${labels[answer]}. `) + (why || '');
      for (const b of choices.querySelectorAll('button')) b.disabled = true;
      const next = button('btn primary', 'הבא', () => { index += 1; draw(); });
      choices.append(next);
      next.focus();
    })));
    progress.textContent = `${index + 1} / ${items.length}`;
  }
  draw();
}

showStats();
