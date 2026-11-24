// Connect mode: every drug and every use is in view, and the player joins each name to its use.
// Press one, then one in the other column. The board is built once and updated in place.
import { comboMultiplier, createConnect, finishConnect, pickItem } from './memory-core.js';
import { countUp, drugName, el, formatTime, ltr } from './memory-dom.js';
import { showExplanation } from './memory-explain.js';
import { sound, vibrate } from './memory-fx.js';

const WRONG_MS = 700;

function hudItem(label) {
  const item = el('div', 'hud-item');
  const value = el('span', 'hud-value', '');
  item.append(el('span', 'hud-label', label), value);
  return { item, value };
}

/** Starts a round. The returned `stop()` cancels the timers (used when leaving mid-round). */
export function playConnect({ root, ids, byId, rng, announce, onFinish, onExit }) {
  let state = createConnect(ids, rng);
  let elapsed = 0;
  let lastTick = 0;
  let started = false;
  let tickTimer = null;
  let shownScore = 0;
  const timers = new Set();

  // ----- layout -----
  const hud = el('div', 'hud');
  const score = hudItem('ניקוד');
  const combo = hudItem('רצף');
  const found = hudItem('חיבורים');
  const time = hudItem('זמן');
  const exit = el('button', 'link-button hud-exit', 'יציאה');
  exit.type = 'button';
  hud.append(score.item, combo.item, found.item, time.item, exit);

  const explain = el('aside', 'explain');
  explain.setAttribute('role', 'status');
  explain.hidden = true;

  const textOf = (side, id) => (side === 'name' ? byId.get(id).name : byId.get(id).use);
  const items = { name: [], use: [] };

  function column(side, title, drugIds) {
    const col = el('section', 'connect-col');
    col.setAttribute('aria-label', title);
    col.append(el('h2', 'connect-head', title));
    const list = el('ul', 'connect-list');
    drugIds.forEach((id, i) => {
      const li = el('li');
      const btn = el('button', 'citem');
      btn.type = 'button';
      btn.dataset.side = side;
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', `${side === 'name' ? 'תרופה' : 'שימוש'}: ${textOf(side, id)}`);
      if (side === 'name') btn.append(drugName(textOf(side, id), 'span'));
      else btn.append(el('span', 'citem-text', textOf(side, id)));
      btn.addEventListener('click', () => onPick(side, i));
      li.append(btn);
      list.append(li);
      items[side][i] = btn;
    });
    col.append(list);
    return col;
  }

  const board = el('div', 'connect');
  board.append(column('name', 'תרופות', state.names), column('use', 'שימושים', state.uses));

  // ----- hud -----
  function renderHud() {
    countUp(score.value, state.score, 350, shownScore);
    shownScore = state.score;
    combo.value.textContent = state.combo >= 2 ? ltr(`🔥 ×${comboMultiplier(state.combo)}`) : ltr('×1');
    combo.item.classList.toggle('is-hot', state.combo >= 2);
    found.value.textContent = `${state.matched.length}/${state.pairs}`;
    time.value.textContent = formatTime(elapsed);
  }

  function startClock() {
    if (started) return;
    started = true;
    lastTick = performance.now();
    tickTimer = setInterval(() => {
      const now = performance.now();
      elapsed += Math.min(now - lastTick, 1000);
      lastTick = now;
      time.value.textContent = formatTime(elapsed);
    }, 250);
  }

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  }

  function stop() {
    clearInterval(tickTimer);
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  // ----- feedback -----
  function paintSelection() {
    for (const side of ['name', 'use']) {
      items[side].forEach((btn, i) => {
        const on = state.selected?.side === side && state.selected.index === i;
        btn.classList.toggle('is-selected', on);
        btn.setAttribute('aria-pressed', String(on));
      });
    }
  }

  function pop(text, btn, bad = false) {
    const node = el('span', bad ? 'pop is-bad' : 'pop', text);
    btn.append(node);
    later(() => node.remove(), 1300);
  }

  function onPick(side, index) {
    const res = pickItem(state, side, index);
    if (res.events.length === 0) return;
    state = res.state;
    startClock();

    for (const ev of res.events) {
      if (ev.type === 'select') {
        explain.hidden = true; // the board stays in view once the player moves on
        sound('flip');
        announce(`נבחר: ${textOf(side, state[side === 'name' ? 'names' : 'uses'][index])}`);
      } else if (ev.type === 'match') {
        const n = state.matched.length;
        for (const [s, i] of [['name', ev.nameIndex], ['use', ev.useIndex]]) {
          const btn = items[s][i];
          btn.classList.add('is-matched');
          btn.dataset.pair = String((n - 1) % 10);
          btn.setAttribute('aria-disabled', 'true');
          btn.append(el('span', 'cbadge', String(n)));
          btn.setAttribute('aria-label', `חובר, ${s === 'name' ? 'תרופה' : 'שימוש'} ${n}: ${textOf(s, ev.drugId)}`);
        }
        sound('match', ev.combo);
        vibrate(15);
        pop(ltr(`+${ev.points}`), items.use[ev.useIndex]);
        announce(`חיבור נכון! ${byId.get(ev.drugId).name}. ${ev.points} נקודות`);
        const done = state.done;
        const next = showExplanation(explain, byId.get(ev.drugId), ev.points, ev.combo,
          done ? () => onFinish(finishConnect(state, elapsed)) : null);
        if (done) {
          stop();
          sound('win');
          if (next) next.focus({ preventScroll: true });
        }
      } else if (ev.type === 'mismatch') {
        const pair = [items.name[ev.nameIndex], items.use[ev.useIndex]];
        for (const btn of pair) btn.classList.add('is-wrong');
        later(() => { for (const btn of pair) btn.classList.remove('is-wrong'); }, WRONG_MS);
        sound('miss');
        vibrate([40, 30, 40]);
        if (ev.penalty > 0) pop(ltr(`−${ev.penalty}`), pair[1], true);
        announce('לא מתאים. נסו שוב');
      }
    }
    paintSelection();
    renderHud();
  }

  exit.addEventListener('click', () => { stop(); onExit(); });

  root.replaceChildren(hud, board, explain);
  renderHud();
  return { stop };
}
