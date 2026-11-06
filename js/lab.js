// Interactive lab pages (labs/<id>.html): step ladder, flip cards, tabs, sorting cards and a
// 10-question round drawn from the lab's quiz. All content is rendered with textContent.
import { presentOptions } from './core.js';
import { ROUND_SIZE, award, parseSorter, pickRound } from './lab-logic.js';
import { keys, load, save } from './storage.js';

const root = document.querySelector('[data-lab]');
const labId = root?.dataset.lab ?? '';
let state = { xp: 0, streak: 0 };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- XP and streak ----------

function showStats() {
  document.getElementById('xp').textContent = String(state.xp);
  document.getElementById('streak').textContent = String(state.streak);
}

function record(correct) {
  state = award(state, correct);
  save(keys.lab(labId), { xp: state.xp });
  showStats();
}

// ---------- static widgets ----------

function setupLadder() {
  const rungs = [...document.querySelectorAll('.rung')];
  for (const rung of rungs) {
    rung.addEventListener('click', () => {
      for (const other of rungs) other.setAttribute('aria-expanded', String(other === rung));
    });
  }
}

function setupFlips() {
  for (const flip of document.querySelectorAll('.flip')) {
    flip.addEventListener('click', () => {
      flip.setAttribute('aria-pressed', String(flip.getAttribute('aria-pressed') !== 'true'));
    });
  }
}

function setupTabs() {
  for (const box of document.querySelectorAll('.tabbox')) {
    const tabs = [...box.querySelectorAll('[role="tab"]')];
    const panels = [...box.querySelectorAll('.drug')];
    const select = (tab, focus) => {
      for (const t of tabs) {
        t.setAttribute('aria-selected', String(t === tab));
        t.tabIndex = t === tab ? 0 : -1;
      }
      for (const p of panels) p.hidden = p.dataset.i !== tab.dataset.i;
      if (focus) tab.focus();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab, false));
      tab.addEventListener('keydown', (event) => {
        // The page is RTL, so the visual "next" tab is to the left.
        const step = { ArrowLeft: 1, ArrowRight: -1 }[event.key];
        if (step === undefined) return;
        event.preventDefault();
        select(tabs[(index + step + tabs.length) % tabs.length], true);
      });
    });
    const initial = tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0];
    if (initial) select(initial, false);
  }
}

// ---------- sorting card ----------

function setupSorter(card) {
  let data;
  try {
    data = parseSorter(card.dataset.sorter);
  } catch {
    card.hidden = true;
    return;
  }
  const question = card.querySelector('.sort-q');
  const buttons = card.querySelector('.sort-btns');
  const verdict = card.querySelector('.lab-verdict');
  const progress = card.querySelector('.sort-prog');
  let items = pickRound(data.items, data.items.length);
  let index = 0;
  let correct = 0;

  function draw() {
    verdict.hidden = true;
    if (index >= items.length) {
      question.textContent = `סיימת: ${correct} מתוך ${items.length}`;
      const again = el('button', 'btn primary', 'שוב');
      again.type = 'button';
      again.addEventListener('click', () => {
        items = pickRound(data.items, data.items.length);
        index = 0;
        correct = 0;
        draw();
      });
      buttons.replaceChildren(again);
      progress.textContent = '';
      again.focus();
      return;
    }
    const item = items[index];
    question.textContent = item.text;
    progress.textContent = `${index + 1} / ${items.length}`;
    const choices = data.labels.map((label, k) => {
      const b = el('button', 'btn', label);
      b.type = 'button';
      b.addEventListener('click', () => {
        const good = k === item.label;
        if (good) correct += 1;
        record(good);
        verdict.hidden = false;
        verdict.className = `lab-verdict ${good ? 'v-good' : 'v-bad'}`;
        verdict.textContent = `${good ? 'נכון. ' : `לא נכון. התשובה: ${data.labels[item.label]}. `}${item.note}`;
        for (const c of choices) c.disabled = true;
        const next = el('button', 'btn primary', 'הבא');
        next.type = 'button';
        next.addEventListener('click', () => {
          index += 1;
          draw();
        });
        buttons.append(next);
        next.focus();
      });
      return b;
    });
    buttons.replaceChildren(...choices);
  }
  draw();
}

// ---------- mini quiz ----------

async function setupQuiz() {
  const box = document.getElementById('quizbox');
  const quizId = root.dataset.quiz;
  if (!box || !quizId) return;
  let questions;
  try {
    const response = await fetch(`../quizzes/${encodeURIComponent(quizId)}.json`);
    if (!response.ok) throw new Error(String(response.status));
    questions = (await response.json()).questions;
  } catch {
    box.replaceChildren(el('p', 'muted', 'לא ניתן לטעון את השאלות. נסו לרענן את הדף.'));
    return;
  }

  let round = [];
  let index = 0;
  let score = 0;

  function start() {
    round = pickRound(questions, ROUND_SIZE);
    index = 0;
    score = 0;
    draw();
  }

  function draw() {
    if (index >= round.length) {
      const again = el('button', 'btn primary', 'סבב נוסף');
      again.type = 'button';
      again.addEventListener('click', start);
      box.replaceChildren(el('div', 'final', `ציון: ${score} מתוך ${round.length}`), again);
      again.focus();
      return;
    }
    const q = round[index];
    const head = el('div', 'q-head');
    head.append(el('span', null, q.topic), el('span', 'num', `${index + 1} / ${round.length}`));
    const bar = el('div', 'prog');
    const fill = el('i');
    fill.style.inlineSize = `${(index / round.length) * 100}%`;
    bar.append(fill);
    const options = el('div', 'opts');
    const feedback = el('div');
    feedback.setAttribute('aria-live', 'polite');
    const shown = presentOptions(q).map((opt) => {
      const b = el('button', 'opt', opt.text);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (opt.correct) score += 1;
        record(opt.correct);
        for (const [i, other] of shown.entries()) {
          options.children[i].disabled = true;
          if (other.correct) options.children[i].classList.add('ok');
        }
        if (!opt.correct) b.classList.add('no');
        const note = !opt.correct && opt.note ? `${opt.note}. ` : '';
        const explain = el('div', 'expl', `${note}${q.explanation}`);
        const next = el('button', 'btn primary', index < round.length - 1 ? 'שאלה הבאה' : 'לסיכום');
        next.type = 'button';
        next.addEventListener('click', () => {
          index += 1;
          draw();
        });
        feedback.replaceChildren(explain, next);
        next.focus();
      });
      return { ...opt, button: b };
    });
    options.append(...shown.map((s) => s.button));
    box.replaceChildren(head, bar, el('div', 'q-text', q.question), options, feedback);
  }
  start();
}

if (root) {
  state = { xp: Number(load(keys.lab(labId), {}).xp) || 0, streak: 0 };
  showStats();
  setupLadder();
  setupFlips();
  setupTabs();
  for (const card of document.querySelectorAll('.sorter')) setupSorter(card);
  setupQuiz();
}
