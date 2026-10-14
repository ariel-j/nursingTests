// The shared shell of the drug-card question games (suffixes, odd one out, blitz): a top bar
// (progress dots or the blitz clock, points, streak), the question card with the quiz page's
// lettered option cards, feedback, and the end screen with stars and the personal best.
// Scoring is pure, in drug-games-core.js.
import { BLITZ_SECONDS, ROUND_SIZE, newRoundState, recordBest, scoreAnswer, secondsLeft, starsFor } from './drug-games-core.js';
import { button, buzz, el, fmt, lessMotion, starsEl } from './drugs-ui.js';
import { load, save } from './storage.js';

const LETTERS = ['א', 'ב', 'ג', 'ד'];
// Blitz moves on by itself: a right answer quickly, a wrong one after showing the right one.
const BLITZ_PAUSE_OK = 650;
const BLITZ_PAUSE_BAD = 1600;

/**
 * Runs a game in `root`. `next()` returns a question:
 * { kicker?, prompt: string | Node, options: [string], correct, reveal?(buttons, chosen),
 *   explain?(): [Node | string] }.
 * `mode` is 'round' (ROUND_SIZE questions, then the end screen) or 'blitz' (as many as fit in
 * BLITZ_SECONDS, after a start screen). Bests are saved under `bestKey` → `gameId`.
 * Returns start(), which (re)starts the game.
 */
export function createGame(root, { gameId, title, mode = 'round', next, bestKey, intro }) {
  let state = newRoundState();
  let question = null;
  let answered = false;
  let startedAt = 0;
  let clock = null;
  let advance = null;

  const hud = el('div', 'game-hud');
  const progress = el('div', mode === 'blitz' ? 'game-timer' : 'game-dots');
  const score = el('span', 'game-score');
  const streak = el('span', 'game-streak');
  hud.append(progress, el('span', 'game-hud-stats'));
  hud.lastChild.append(score, streak);
  const stage = el('div', 'game-stage');
  root.replaceChildren(hud, stage);

  function renderHud() {
    score.textContent = `${state.score} נק׳`;
    streak.replaceChildren();
    if (state.streak >= 2) {
      const flame = el('span', null, '🔥');
      flame.setAttribute('aria-hidden', 'true');
      streak.append(flame, ` רצף ${state.streak}`);
    }
    if (mode === 'round') {
      progress.replaceChildren(...Array.from({ length: ROUND_SIZE }, (_, i) => {
        const dot = el('span', 'game-dot');
        if (i < state.answered) dot.classList.add(i < state.answered && results[i] ? 'is-ok' : 'is-bad');
        if (i === state.answered && !answered) dot.classList.add('is-now');
        return dot;
      }));
      progress.setAttribute('role', 'img');
      progress.setAttribute('aria-label', `שאלה ${Math.min(state.answered + 1, ROUND_SIZE)} מתוך ${ROUND_SIZE}`);
    }
  }
  const results = [];

  function tickClock() {
    // Leaving the game (another game or tab) stops the clock and goes back to the start screen.
    if (root.offsetParent === null) {
      start();
      return;
    }
    const left = secondsLeft(startedAt, Date.now(), BLITZ_SECONDS);
    const share = Math.max(0, 1 - (Date.now() - startedAt) / (BLITZ_SECONDS * 1000));
    progress.replaceChildren(el('span', 'game-timer-fill'), el('span', 'game-timer-text', `${left} שנ׳`));
    progress.firstChild.style.inlineSize = `${share * 100}%`;
    progress.classList.toggle('is-low', left <= 10);
    if (left === 0) finish();
  }

  function floatPoints(target, points) {
    if (points <= 0 || lessMotion()) return;
    const f = el('span', 'game-float', `+${points}`);
    f.setAttribute('aria-hidden', 'true');
    target.append(f);
    f.addEventListener('animationend', () => f.remove());
  }

  function ask() {
    clearTimeout(advance);
    question = next();
    answered = false;
    renderHud();
    const card = el('div', 'game-card');
    if (question.kicker) card.append(el('p', 'game-kicker', question.kicker));
    const prompt = el('div', 'game-prompt');
    prompt.append(question.prompt);
    const list = el('div', 'options game-options');
    const buttons = question.options.map((text, i) => {
      const b = button('option', undefined, () => choose(i, buttons, card));
      b.append(el('span', 'letter', LETTERS[i]), el('span', 'option-text', fmt(text)));
      return b;
    });
    list.append(...buttons);
    const feedback = el('div', 'game-feedback');
    feedback.setAttribute('role', 'status');
    card.append(prompt, list, feedback);
    stage.replaceChildren(card);
    buttons[0].focus({ preventScroll: true });
  }

  function choose(chosen, buttons, card) {
    if (answered) return;
    answered = true;
    const ok = chosen === question.correct;
    state = scoreAnswer(state, ok);
    results.push(ok);
    buttons.forEach((b, i) => {
      b.disabled = true;
      if (i === question.correct) b.classList.add('is-correct');
      else if (i === chosen) b.classList.add('is-wrong');
      else b.classList.add('is-dim');
    });
    question.reveal?.(buttons, chosen);
    if (ok) {
      floatPoints(buttons[chosen], state.points);
      card.classList.add('is-pop');
    } else {
      buzz();
      card.classList.add('is-shake');
    }
    renderHud();
    const feedback = card.querySelector('.game-feedback');
    const verdict = ok
      ? `נכון! +${state.points}${state.streak >= 3 ? ` · רצף ${state.streak}` : ''}`
      : `לא נכון. התשובה: ${question.options[question.correct]}`;
    feedback.replaceChildren(el('p', ok ? 'is-ok' : 'is-bad', verdict), ...(question.explain?.() ?? []).filter(Boolean));
    if (mode === 'blitz') {
      advance = setTimeout(ask, ok ? BLITZ_PAUSE_OK : BLITZ_PAUSE_BAD);
      return;
    }
    const last = state.answered >= ROUND_SIZE;
    const go = button('primary game-next', last ? 'לתוצאות' : 'הבאה', last ? finish : ask);
    feedback.append(go);
    go.focus({ preventScroll: true });
  }

  function finish() {
    question = null;
    clearInterval(clock);
    clearTimeout(advance);
    clock = null;
    const total = mode === 'blitz' ? state.answered : ROUND_SIZE;
    const stars = starsFor(state.right, Math.max(total, mode === 'blitz' ? 10 : total));
    const bests = load(bestKey, {}) ?? {};
    const { best, isNew } = recordBest(bests[gameId], { score: state.score, stars });
    save(bestKey, { ...bests, [gameId]: best });

    const end = el('div', 'game-card game-end');
    end.append(
      el('p', 'game-kicker', mode === 'blitz' ? 'נגמר הזמן!' : 'סוף הסבב'),
      starsEl(stars),
      el('p', 'game-end-score', `${state.score} נקודות`),
    );
    if (isNew) end.append(el('p', 'game-new-best', 'שיא חדש!'));
    const stats = el('p', 'meta game-end-stats');
    stats.append(
      el('span', null, `נכון ${state.right} מתוך ${state.answered}`),
      el('span', null, `רצף הכי ארוך ${state.bestStreak}`),
      el('span', null, `השיא שלך ${best.score}`),
    );
    const again = button('primary', 'שחק שוב', start);
    end.append(stats, again);
    end.setAttribute('role', 'status');
    stage.replaceChildren(end);
    renderHud();
    again.focus({ preventScroll: true });
  }

  function begin() {
    state = newRoundState();
    results.length = 0;
    if (mode === 'blitz') {
      startedAt = Date.now();
      tickClock();
      clock = setInterval(tickClock, 200);
    }
    ask();
  }

  function start() {
    question = null;
    clearInterval(clock);
    clearTimeout(advance);
    state = newRoundState();
    results.length = 0;
    renderHud();
    if (mode !== 'blitz') {
      begin();
      return;
    }
    progress.replaceChildren(el('span', 'game-timer-fill'), el('span', 'game-timer-text', `${BLITZ_SECONDS} שנ׳`));
    progress.firstChild.style.inlineSize = '100%';
    const best = (load(bestKey, {}) ?? {})[gameId];
    const card = el('div', 'game-card game-intro');
    card.append(el('p', 'game-kicker', title), el('p', null, intro));
    if (best?.score > 0) card.append(el('p', 'meta', `השיא שלך: ${best.score} נקודות`));
    const go = button('primary game-start', 'התחל', begin);
    card.append(go);
    stage.replaceChildren(card);
    go.focus({ preventScroll: true });
  }

  // Keys 1-4 answer while this game is on screen (not while typing in a field).
  document.addEventListener('keydown', (e) => {
    if (!question || answered || root.offsetParent === null) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (!digit) return;
    const target = stage.querySelectorAll('.option')[Number(digit[1]) - 1];
    if (target && !target.disabled) {
      e.preventDefault();
      target.click();
    }
  });

  return start;
}
