// Interactive parts of the circulars summary (summaries/circulars.html): section ladder, flip
// cards, tabs, XP and streak, light/dark button and a 10-question mini quiz. Ported as is from the
// standalone study page; the only differences are that it works inside the article, keeps its
// state in the guarded storage wrapper, and takes the questions from quizzes/circulars-1.json
// (so the quiz has a single copy) instead of carrying its own list.
import { load, save } from './storage.js';

const root = document.querySelector('article.summary[data-system="circulars"]');

const shuffled = (list) => list.slice().sort(() => Math.random() - 0.5);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- XP and streak ----------
let xp = Number(load('circulars:xp', 0)) || 0;
let streak = 0;
const xpEl = root.querySelector('#circ-xp');
const streakEl = root.querySelector('#circ-streak');

function showStats() {
  xpEl.textContent = xp;
  streakEl.textContent = streak;
}

function award(ok) {
  if (ok) {
    streak++;
    xp += 10 + (streak >= 3 ? 5 : 0);
  } else {
    streak = 0;
  }
  save('circulars:xp', xp);
  showStats();
}

// ---------- light / dark ----------
function initTheme() {
  const html = document.documentElement;
  const saved = load('circulars:theme');
  if (saved === 'light' || saved === 'dark') html.setAttribute('data-theme', saved);
  root.querySelector('#circ-theme').addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    const dark = current === 'dark' || (!current && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    save('circulars:theme', next);
  });
}

// ---------- ladder, flip cards, tabs ----------
function initLadder() {
  const rungs = root.querySelectorAll('.rung');
  for (const rung of rungs) {
    rung.addEventListener('click', () => {
      for (const other of rungs) other.setAttribute('aria-expanded', other === rung ? 'true' : 'false');
    });
  }
}

function initFlips() {
  for (const card of root.querySelectorAll('.flip')) {
    card.addEventListener('click', () => {
      card.setAttribute('aria-pressed', card.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    });
  }
}

function initTabs() {
  for (const box of root.querySelectorAll('.tabbox')) {
    const tabs = box.querySelectorAll('[role="tab"]');
    const panels = box.querySelectorAll('.drug');
    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        for (const other of tabs) other.setAttribute('aria-selected', other === tab ? 'true' : 'false');
        for (const panel of panels) panel.hidden = panel.dataset.i !== tab.dataset.i;
      });
    }
  }
}

// ---------- sorting game (.sorter with data-s = {labels, items}); none on the page today ----------
function initSorters() {
  for (const box of root.querySelectorAll('.sorter')) {
    const data = JSON.parse(box.dataset.s);
    let items = shuffled(data.items);
    let i = 0;
    let right = 0;
    const question = box.querySelector('.sort-q');
    const buttons = box.querySelector('.sort-btns');
    const verdict = box.querySelector('.verdict');
    const progress = box.querySelector('.sort-prog');

    const draw = () => {
      verdict.hidden = true;
      buttons.replaceChildren();
      if (i >= items.length) {
        question.textContent = `סיימת: ${right} מתוך ${items.length}`;
        const again = el('button', 'btn primary', 'שוב');
        again.type = 'button';
        again.addEventListener('click', () => {
          items = shuffled(items);
          i = 0;
          right = 0;
          draw();
        });
        buttons.append(again);
        progress.textContent = '';
        return;
      }
      question.textContent = items[i][0];
      data.labels.forEach((label, k) => {
        const btn = el('button', 'btn', label);
        btn.type = 'button';
        btn.addEventListener('click', () => {
          const good = k === items[i][1];
          if (good) right++;
          award(good);
          verdict.hidden = false;
          verdict.className = `verdict ${good ? 'v-good' : 'v-bad'}`;
          verdict.textContent = (good ? 'נכון. ' : `לא נכון. התשובה: ${data.labels[items[i][1]]}. `) + (items[i][2] || '');
          for (const x of buttons.querySelectorAll('button')) x.disabled = true;
          const next = el('button', 'btn primary', 'הבא');
          next.type = 'button';
          next.addEventListener('click', () => {
            i++;
            draw();
          });
          buttons.append(next);
        });
        buttons.append(btn);
      });
      progress.textContent = `${i + 1} / ${items.length}`;
    };
    draw();
  }
}

// ---------- mini quiz: 10 random questions from the circulars-1 quiz ----------
// Same shape as the original list: the correct answer first, then the wrong ones with their notes.
function toBankItem(q) {
  const ordered = [q.options[q.correct], ...q.options.filter((_, k) => k !== q.correct)];
  return {
    q: q.question,
    o: ordered.map((o) => o.text),
    n: ordered.map((o) => o.note ?? ''),
    e: q.explanation,
    t: q.topic,
  };
}

async function initQuiz() {
  const box = root.querySelector('#circ-quizbox');
  let bank;
  try {
    const res = await fetch('../quizzes/circulars-1.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bank = (await res.json()).questions.map(toBankItem);
  } catch (err) {
    console.error(err);
    box.textContent = location.protocol === 'file:'
      ? 'יש להריץ דרך שרת (npm run serve), הדפדפן חוסם טעינה מקובץ מקומי.'
      : 'לא הצלחנו לטעון את השאלות.';
    return;
  }

  let set;
  let i;
  let score;

  const start = () => {
    set = shuffled(bank).slice(0, 10);
    i = 0;
    score = 0;
    draw();
  };

  const draw = () => {
    if (i >= set.length) {
      const final = el('div', 'final', `ציון: ${score} מתוך ${set.length}`);
      const again = el('button', 'btn primary', 'סבב נוסף');
      again.type = 'button';
      again.addEventListener('click', start);
      box.replaceChildren(final, again);
      return;
    }
    const q = set[i];
    const order = shuffled(q.o.map((_, k) => k));

    const head = el('div', 'q-head');
    head.append(el('span', null, q.t), el('span', null, `${i + 1} / ${set.length}`));
    const bar = el('div', 'prog');
    const fill = document.createElement('i');
    fill.style.width = `${(i / set.length) * 100}%`;
    bar.append(fill);
    const text = el('div', 'q-text', q.q);
    const opts = el('div', 'opts');

    for (const k of order) {
      const btn = el('button', 'opt', q.o[k]);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        const good = k === 0;
        if (good) score++;
        award(good);
        for (const x of opts.querySelectorAll('button')) x.disabled = true;
        btn.classList.add(good ? 'ok' : 'no');
        for (const x of opts.querySelectorAll('button')) {
          if (x.textContent === q.o[0]) x.classList.add('ok');
        }
        const note = good ? '' : (q.n[k] ? `${q.n[k]}. ` : '');
        const explanation = el('div', 'expl', note + q.e);
        explanation.setAttribute('role', 'status');
        const next = el('button', 'btn primary', i < set.length - 1 ? 'שאלה הבאה' : 'לסיכום');
        next.type = 'button';
        next.addEventListener('click', () => {
          i++;
          draw();
        });
        box.append(explanation, next);
        next.focus();
      });
      opts.append(btn);
    }
    box.replaceChildren(head, bar, text, opts);
  };

  start();
}

if (root) {
  showStats();
  initTheme();
  initLadder();
  initFlips();
  initTabs();
  initSorters();
  initQuiz();
}
