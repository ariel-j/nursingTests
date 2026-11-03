// Interactive layer for the lab summaries (summaries/pharm-*.html). Each page is complete static
// HTML first (tabs as sections, the sorter as a list, ...), so it reads, prints and joins the combined
// PDF without this script. Here the widgets are built next to the static parts, which are then hidden
// on screen only (css/summary.css shows them again when printing).
// Content comes from the page and the quiz JSON and is always written with textContent.
import { isolateNumberRanges as fmt, isValidQuizId, presentOptions, shuffle, validateQuiz } from './core.js';
import {
  WARMUP_QUESTIONS, award, clampIndex, nextTab, normalizeXp, parseSorterLabels, pickQuestions, sorterIsRight,
} from './lab-core.js';
import { keys, load, save } from './storage.js';

let uid = 0;
const nextId = (prefix) => `${prefix}-${++uid}`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, className = 'secondary') {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

/** Keeps the static markup for print and hides it on screen; `ui` takes its place. */
function swapIn(staticNode, ui) {
  staticNode.dataset.labStatic = '';
  staticNode.hidden = true;
  ui.classList.add('lab-ui', 'no-print');
  staticNode.after(ui);
}

// ---------- XP and streak ----------

const progress = { xp: normalizeXp(load(keys.labXp(), 0)), streak: 0 };
let statsEl = null;

function renderStats() {
  if (!statsEl) return;
  const stat = (label, value) => {
    const item = el('span', 'lab-stat');
    item.append(`${label} `, el('b', null, String(value)));
    return item;
  };
  statsEl.replaceChildren(stat('XP', progress.xp), stat('רצף', progress.streak));
}

/** Records one answer: updates and stores the XP, resets or extends the streak. */
function record(correct) {
  const next = award(progress, correct);
  progress.xp = next.xp;
  progress.streak = next.streak;
  save(keys.labXp(), progress.xp);
  renderStats();
}

// ---------- tabs ----------

function initTabs(box) {
  const panels = [...box.querySelectorAll(':scope > .lab-tab')];
  if (panels.length < 2) return; // a single panel needs no tabs

  const list = el('div', 'lab-tablist lab-ui no-print');
  list.setAttribute('role', 'tablist');
  const rtl = getComputedStyle(box).direction === 'rtl';

  const tabs = panels.map((panel) => {
    const tab = button(panel.dataset.tab, 'lab-tab-btn');
    tab.id = nextId('lab-tab');
    tab.dir = 'auto';
    tab.setAttribute('role', 'tab');
    panel.id = nextId('lab-panel');
    panel.dataset.labStatic = '';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    tab.setAttribute('aria-controls', panel.id);
    return tab;
  });

  function select(index, focus = false) {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    if (focus) tabs[index].focus();
  }

  tabs.forEach((tab, i) => tab.addEventListener('click', () => select(i)));
  list.addEventListener('keydown', (event) => {
    const current = tabs.indexOf(document.activeElement);
    const target = nextTab(event.key, current, tabs.length, rtl);
    if (target === null || current < 0) return;
    event.preventDefault();
    select(target, true);
  });

  list.append(...tabs);
  box.prepend(list);
  box.classList.add('is-enhanced');
  select(0);
}

// ---------- sorter ----------

function readSorterItems(box, labelCount) {
  const items = [...box.querySelectorAll('li[data-answer]')].map((li) => ({
    text: li.querySelector('b')?.textContent ?? '',
    answer: Number(li.dataset.answer),
    why: li.querySelector('.why')?.textContent ?? '',
  }));
  const ok = items.length > 0 && items.every((i) => i.text && Number.isInteger(i.answer) && i.answer >= 0 && i.answer < labelCount);
  return ok ? items : null;
}

function initSorter(box) {
  const labels = parseSorterLabels(box.dataset.labels);
  const items = labels && readSorterItems(box, labels.length);
  const staticList = box.querySelector('ul');
  if (!items || !staticList) return;

  const ui = el('div', 'lab-game');
  const question = el('p', 'lab-q');
  question.tabIndex = -1;
  const choices = el('div', 'lab-choices');
  const feedback = el('div', 'feedback');
  feedback.setAttribute('role', 'status');
  const count = el('p', 'muted lab-count');
  ui.append(question, choices, feedback, count);

  let order = shuffle(items);
  let i = 0;
  let right = 0;

  function draw(focus) {
    feedback.hidden = true;
    feedback.replaceChildren();
    choices.replaceChildren();
    if (i >= order.length) {
      question.textContent = `סיימת: ${right} מתוך ${order.length}`;
      count.textContent = '';
      const again = button('שוב', 'primary');
      again.addEventListener('click', () => {
        order = shuffle(items);
        i = 0;
        right = 0;
        draw(true);
      });
      choices.append(again);
      if (focus) question.focus();
      return;
    }
    const item = order[i];
    question.textContent = item.text;
    count.textContent = `${i + 1} / ${order.length}`;
    labels.forEach((label, k) => {
      const pick = button(label);
      pick.addEventListener('click', () => answer(item, k));
      choices.append(pick);
    });
    if (focus) question.focus();
  }

  function answer(item, pick) {
    const ok = sorterIsRight(item.answer, pick);
    if (ok) right++;
    record(ok);
    for (const b of choices.querySelectorAll('button')) b.disabled = true;
    feedback.hidden = false;
    feedback.className = `feedback ${ok ? 'good' : 'bad'}`;
    const verdict = el('p', 'verdict', ok ? 'נכון.' : `לא נכון. התשובה: ${labels[item.answer]}.`);
    feedback.replaceChildren(verdict);
    if (item.why) feedback.append(el('p', null, item.why));
    const next = button(i + 1 < order.length ? 'הבא' : 'לסיכום', 'primary');
    next.addEventListener('click', () => {
      i++;
      draw(true);
    });
    feedback.append(next);
    next.focus();
  }

  swapIn(staticList, ui);
  draw(false);
}

// ---------- flip cards ----------

function initFlips(box) {
  const rows = [...box.querySelectorAll('dl.lab-flip')];
  if (rows.length === 0) return;
  const ui = el('div', 'lab-flip-ui');
  ui.append(el('p', 'sec-note', 'הקישו על כרטיס כדי להפוך אותו.'));
  const grid = el('div', 'lab-flip-grid');
  for (const row of rows) {
    const front = el('span', 'lab-flip-front', row.querySelector('dt').textContent);
    const back = el('span', 'lab-flip-back', row.querySelector('dd').textContent);
    back.hidden = true;
    const card = button('', 'lab-flip-card');
    card.setAttribute('aria-pressed', 'false');
    card.append(front, back);
    card.addEventListener('click', () => {
      const on = card.getAttribute('aria-pressed') !== 'true';
      card.setAttribute('aria-pressed', String(on));
      front.hidden = on;
      back.hidden = !on;
    });
    grid.append(card);
  }
  ui.append(grid);
  swapIn(box, ui);
}

// ---------- stepper ----------

function initStepper(box) {
  const steps = [...box.querySelectorAll('ol > li')].map((li) => ({
    title: li.querySelector('b')?.textContent ?? '',
    body: [...li.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim(),
  }));
  if (steps.length < 2) return;

  const ui = el('div', 'lab-stepper-ui');
  const count = el('p', 'muted lab-count');
  const view = el('div', 'lab-step-view');
  view.setAttribute('aria-live', 'polite');
  const nav = el('div', 'lab-step-nav');
  const prev = button('הקודם');
  const next = button('הבא', 'primary');
  nav.append(prev, next);
  ui.append(count, view, nav);

  let index = 0;
  function draw() {
    const step = steps[index];
    count.textContent = `שלב ${index + 1} מתוך ${steps.length}`;
    view.replaceChildren(el('b', null, step.title), ' ', step.body);
    prev.disabled = index === 0;
    next.disabled = index === steps.length - 1;
  }
  function go(delta, from, other) {
    index = clampIndex(index + delta, steps.length);
    draw();
    // A button that just became disabled cannot keep keyboard focus.
    if (from.disabled) other.focus();
  }
  prev.addEventListener('click', () => go(-1, prev, next));
  next.addEventListener('click', () => go(1, next, prev));

  swapIn(box.querySelector('ol'), ui);
  draw();
}

// ---------- slider ----------

function initSlider(box) {
  const stops = [...box.querySelectorAll('ul > li')].map((li) => ({
    title: li.querySelector('b')?.textContent ?? '',
    body: [...li.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim(),
  }));
  const heading = box.querySelector('h3');
  if (stops.length < 2 || !heading) return;

  heading.id = nextId('lab-slider-label');
  const input = el('input');
  input.type = 'range';
  input.min = '0';
  input.max = String(stops.length - 1);
  input.step = '1';
  input.value = '0';
  input.setAttribute('aria-labelledby', heading.id);
  const out = el('div', 'feedback good');
  out.setAttribute('role', 'status');
  const ui = el('div', 'lab-slider-ui');
  ui.append(input, out);

  function draw() {
    const stop = stops[clampIndex(Number(input.value), stops.length)];
    input.setAttribute('aria-valuetext', stop.title);
    out.replaceChildren(el('b', null, stop.title), ' ', stop.body);
  }
  input.addEventListener('input', draw);

  swapIn(box.querySelector('ul'), ui);
  draw();
}

// ---------- warm-up quiz ----------

async function loadQuiz(id) {
  const res = await fetch(`../quizzes/${encodeURIComponent(id)}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const quiz = await res.json();
  const errors = validateQuiz(quiz);
  if (errors.length > 0) throw new Error(errors[0]);
  return quiz;
}

function runWarmup(section, quiz) {
  const box = section.querySelector('.lab-quiz-box');
  let set;
  let i;
  let score;

  function start() {
    set = pickQuestions(quiz, WARMUP_QUESTIONS);
    i = 0;
    score = 0;
    draw(false);
  }

  function finish() {
    const result = el('p', 'lab-q', `ציון: ${score} מתוך ${set.length}`);
    result.tabIndex = -1;
    const again = button('סבב נוסף', 'primary');
    again.addEventListener('click', start);
    box.replaceChildren(result, again);
    result.focus();
  }

  function draw(focus) {
    if (i >= set.length) {
      finish();
      return;
    }
    const q = set[i];
    const head = el('p', 'muted lab-count', `${q.topic} · ${i + 1} / ${set.length}`);
    const text = el('p', 'lab-q', fmt(q.question));
    text.tabIndex = -1;
    const list = el('ul', 'options');
    const feedback = el('div', 'feedback');
    feedback.setAttribute('role', 'status');
    feedback.hidden = true;

    const buttons = presentOptions(q).map((opt) => {
      const b = el('button', 'option');
      b.type = 'button';
      b.dataset.index = String(opt.index);
      b.append(el('span', null, fmt(opt.text)));
      b.addEventListener('click', () => choose(opt.index));
      const li = el('li');
      li.append(b);
      list.append(li);
      return b;
    });

    function choose(chosen) {
      const ok = chosen === q.correct;
      if (ok) score++;
      record(ok);
      for (const b of buttons) {
        const index = Number(b.dataset.index);
        b.disabled = true;
        if (index === q.correct) b.classList.add('is-correct');
        else if (index === chosen) b.classList.add('is-wrong');
        else b.classList.add('is-dim');
      }
      feedback.hidden = false;
      feedback.className = `feedback ${ok ? 'good' : 'bad'}`;
      feedback.replaceChildren(el('p', 'verdict', ok ? 'נכון!' : 'לא נכון.'));
      const note = q.options[chosen].note ?? '';
      if (!ok && note.trim() !== '') feedback.append(el('p', 'note', fmt(`על התשובה שבחרת: ${note}`)));
      feedback.append(el('p', 'explanation', fmt(q.explanation)));
      const nextBtn = button(i + 1 < set.length ? 'שאלה הבאה' : 'לסיכום', 'primary');
      nextBtn.addEventListener('click', () => {
        i++;
        draw(true);
      });
      feedback.append(nextBtn);
      nextBtn.focus();
    }

    box.replaceChildren(head, text, list, feedback);
    if (focus) text.focus();
  }

  start();
}

async function initQuiz(section) {
  const id = section.dataset.quiz;
  if (!isValidQuizId(id)) return;
  try {
    runWarmup(section, await loadQuiz(id));
    section.hidden = false;
  } catch (err) {
    // Offline or opened from a file: the warm-up stays hidden, the link to the full quiz remains.
    console.error(err);
  }
}

// ---------- start ----------

function init(article) {
  article.classList.add('lab-js');
  statsEl = article.querySelector('.lab-stats');
  if (statsEl) {
    statsEl.setAttribute('role', 'group');
    statsEl.setAttribute('aria-label', 'ניקוד');
    statsEl.hidden = false;
    renderStats();
  }
  article.querySelectorAll('.lab-tabs').forEach(initTabs);
  article.querySelectorAll('.lab-sorter').forEach(initSorter);
  article.querySelectorAll('.lab-flips').forEach(initFlips);
  article.querySelectorAll('.lab-stepper').forEach(initStepper);
  article.querySelectorAll('.lab-slider').forEach(initSlider);
  const quiz = article.querySelector('section.lab-quiz');
  if (quiz) initQuiz(quiz);
}

const article = document.querySelector('article.summary[data-quiz]');
if (article) init(article);
