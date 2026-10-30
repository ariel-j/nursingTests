// Pairs mode: flip a drug's name card and its association card. The board is built once and updated
// in place, so keyboard focus stays on the card that was pressed.
import { clearMismatch, comboMultiplier, createPairs, finishPairs, flip } from './memory-core.js';
import { drugDetail } from './memory-detail.js';
import { clear, countUp, drugName, el, formatTime, ltr } from './memory-dom.js';
import { sound, vibrate } from './memory-fx.js';

const MISMATCH_MS = 1100;
const FLIP_BACK_MS = 450;

const KIND = {
  name: { icon: '💊', label: 'שם', spoken: 'שם תרופה' },
  assoc: { icon: '💡', label: 'אסוציאציה', spoken: 'אסוציאציה' },
};

function hudItem(label) {
  const item = el('div', 'hud-item');
  const value = el('span', 'hud-value', '');
  item.append(el('span', 'hud-label', label), value);
  return { item, value };
}

/**
 * Starts a round. `onFinish(result)` is called when the player leaves the last explanation;
 * the returned `stop()` cancels all timers (used when leaving mid-round).
 */
export function playPairs({ root, ids, byId, rng, announce, onFinish, onExit }) {
  let state = createPairs(ids, rng);
  let elapsed = 0;
  let lastTick = 0;
  let started = false;
  let tickTimer = null;
  let mismatchTimer = null;
  let shownScore = 0;

  // ----- layout -----
  const hud = el('div', 'hud');
  const score = hudItem('ניקוד');
  const combo = hudItem('רצף');
  const found = hudItem('זוגות');
  const time = hudItem('זמן');
  const exit = el('button', 'link-button hud-exit', 'יציאה');
  exit.type = 'button';
  hud.append(score.item, combo.item, found.item, time.item, exit);

  const board = el('div', 'board');
  board.setAttribute('role', 'group');
  board.setAttribute('aria-label', `לוח של ${state.cards.length} קלפים`);
  const explain = el('aside', 'explain');
  explain.setAttribute('role', 'status');
  explain.hidden = true;

  const content = (i) => {
    const card = state.cards[i];
    return card.kind === 'name' ? byId.get(card.drugId).name : byId.get(card.drugId).association;
  };

  const buttons = state.cards.map((card, i) => {
    const btn = el('button', 'mcard');
    btn.type = 'button';
    btn.dataset.kind = card.kind;
    const inner = el('span', 'mcard-inner');
    const back = el('span', 'mcard-face mcard-back');
    back.setAttribute('aria-hidden', 'true');
    back.append(el('span', 'mcard-icon', KIND[card.kind].icon), el('span', 'mcard-kind', KIND[card.kind].label), el('span', 'mcard-no', String(i + 1)));
    const front = el('span', 'mcard-face mcard-front');
    front.setAttribute('aria-hidden', 'true');
    inner.append(back, front);
    btn.append(inner);
    btn.addEventListener('click', () => onCard(i));
    board.append(btn);
    return { btn, front };
  });

  const labelDown = (i) => `קלף ${i + 1} מתוך ${state.cards.length}, ${KIND[state.cards[i].kind].spoken}, הפוך`;
  buttons.forEach((b, i) => b.btn.setAttribute('aria-label', labelDown(i)));

  function setUp(i, up) {
    const { btn, front } = buttons[i];
    if (up) {
      clear(front);
      if (state.cards[i].kind === 'name') front.append(drugName(content(i)));
      else front.textContent = content(i);
      btn.classList.add('is-up');
      btn.setAttribute('aria-label', `${KIND[state.cards[i].kind].spoken}: ${content(i)}`);
    } else {
      btn.classList.remove('is-up', 'is-wrong');
      btn.setAttribute('aria-label', labelDown(i));
      // The text leaves the page once the card has turned back, so it cannot be searched for.
      setTimeout(() => {
        if (!btn.classList.contains('is-up')) clear(front);
      }, FLIP_BACK_MS);
    }
  }

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

  function stop() {
    clearInterval(tickTimer);
    clearTimeout(mismatchTimer);
  }

  // ----- feedback -----
  function pop(text, index, bad = false) {
    const node = el('span', bad ? 'pop is-bad' : 'pop', text);
    buttons[index].btn.append(node);
    setTimeout(() => node.remove(), 1300);
  }

  function showExplanation(drugId, points, comboNow, finished) {
    clear(explain);
    const head = el('div', 'explain-head');
    head.append(el('span', 'explain-points', ltr(`+${points}`) + (comboNow >= 2 ? ` · רצף ${ltr(`×${comboMultiplier(comboNow)}`)}` : '')));
    if (!finished) {
      const close = el('button', 'link-button', 'סגירה');
      close.type = 'button';
      close.addEventListener('click', () => { explain.hidden = true; });
      head.append(close);
    }
    explain.append(head, drugDetail(byId.get(drugId)));
    let next = null;
    if (finished) {
      next = el('button', 'primary', 'לתוצאות');
      next.type = 'button';
      next.addEventListener('click', () => onFinish(finishPairs(state, elapsed)));
      const actions = el('div', 'actions');
      actions.append(next);
      explain.append(actions);
    }
    explain.hidden = false;
    explain.classList.remove('is-new');
    void explain.offsetWidth; // restart the slide-in
    explain.classList.add('is-new');
    return next;
  }

  // ----- play -----
  function resolveMismatch() {
    clearTimeout(mismatchTimer);
    for (const i of state.faceUp) setUp(i, false);
    state = clearMismatch(state);
  }

  function onCard(i) {
    if (state.locked) resolveMismatch();
    const res = flip(state, i);
    if (res.events.length === 0) return;
    state = res.state;
    startClock();

    for (const ev of res.events) {
      if (ev.type === 'flip') {
        setUp(ev.index, true);
        sound('flip');
        if (state.faceUp.length === 1) announce(content(ev.index));
      } else if (ev.type === 'match') {
        for (const idx of ev.indices) buttons[idx].btn.classList.add('is-matched');
        for (const idx of ev.indices) buttons[idx].btn.setAttribute('aria-disabled', 'true');
        sound('match', ev.combo);
        vibrate(15);
        pop(ltr(`+${ev.points}`), ev.indices[1]);
        announce(`התאמה! ${byId.get(ev.drugId).name}. ${ev.points} נקודות`);
        const done = state.done;
        const next = showExplanation(ev.drugId, ev.points, ev.combo, done);
        if (done) {
          stop();
          sound('win');
          if (next) next.focus({ preventScroll: true });
        }
      } else if (ev.type === 'mismatch') {
        for (const idx of ev.indices) buttons[idx].btn.classList.add('is-wrong');
        sound('miss');
        vibrate([40, 30, 40]);
        if (ev.penalty > 0) pop(ltr(`−${ev.penalty}`), ev.indices[1], true);
        announce(`${content(ev.indices[0])}. ${content(ev.indices[1])}. לא תואם${ev.avoidable ? ', הקלף התואם כבר נחשף' : ''}`);
        mismatchTimer = setTimeout(resolveMismatch, MISMATCH_MS);
      }
    }
    renderHud();
  }

  exit.addEventListener('click', () => { stop(); onExit(); });

  const wrap = el('div', 'board-wrap');
  wrap.append(board);
  root.replaceChildren(hud, wrap, explain);
  renderHud();
  return { stop };
}
