// The games on the concept-cards page. The four question games and the blitz run on the shared shell
// (drugs-shell.js); the matching board is its own. All ask about the chosen topics
// (concepts-topics.js); personal bests count only with every topic chosen. Logic in concepts-core.js.
import { BLITZ_KINDS, QUESTION_GAMES, buildMatchRound, randomQuestion, updateMatchWeights } from './concepts-core.js';
import { formatTime, recordBestTime, starsFor } from './drug-games-core.js';
import { createGame } from './drugs-shell.js';
import { button, buzz, el, fmt, starsEl } from './drugs-ui.js';
import { shuffle } from './core.js';
import { keys, load, save } from './storage.js';

const $ = (id) => document.getElementById(id);
const EMPTY = 'אין מספיק כרטיסיות בנושאים שבחרתם. בחרו עוד נושאים.';
const RECENT = 15; // the last questions not asked again

/** A question of concepts-core.js as a shell question: options reshuffled, the chosen wrong answer explained. */
function shellQuestion(q) {
  const order = shuffle(q.options.map((_, i) => i));
  let note = null;
  return {
    kicker: q.topic,
    prompt: el('span', 'game-prompt-text', fmt(q.question)),
    options: order.map((i) => q.options[i].text),
    correct: order.indexOf(q.correct),
    reveal(_buttons, chosen) {
      note = q.options[order[chosen]].note ?? null;
    },
    explain: () => [note ? el('p', 'muted', fmt(note)) : null, el('p', null, fmt(q.explanation))],
  };
}

/** `next()` for the shell: a random question of `kinds` about the chosen topics, not one of the last few. */
function questionSource(bank, kinds, topics) {
  const recent = [];
  return () => {
    let q = null;
    for (let tries = 0; tries < 6; tries++) {
      q = randomQuestion(bank, kinds, topics.chosen());
      if (!q || !recent.includes(q.id)) break;
    }
    if (!q) return null;
    recent.push(q.id);
    if (recent.length > RECENT) recent.shift();
    return shellQuestion(q);
  };
}

/** The question games and the blitz; returns { concepts, numbers, practice, order, blitz } starters. */
export function initQuestionGames(bank, topics, bestKey) {
  const starters = {};
  for (const [name, kinds] of Object.entries(QUESTION_GAMES)) {
    starters[name] = createGame($(`${name}-area`), {
      gameId: name,
      bestKey,
      countsBest: topics.all,
      emptyText: EMPTY,
      next: questionSource(bank, kinds, topics),
    });
  }
  starters.blitz = createGame($('blitz-area'), {
    gameId: 'blitz',
    title: 'בליץ: 60 שניות',
    mode: 'blitz',
    bestKey,
    countsBest: topics.all,
    emptyText: EMPTY,
    intro: 'כמה שיותר תשובות נכונות בדקה אחת: מושגים, מספרים, בדיקות, תרופות, סדרים והתאמות. כל תשובה נכונה ברצף שווה יותר נקודות. מקשים 1–4 עונים.',
    next: questionSource(bank, BLITZ_KINDS, topics),
  });
  return starters;
}

// ---------- matching board ----------

export function initMatch(bank, topics, subjectId, bestKey) {
  const board = $('match-board');
  const status = $('match-status');
  const title = $('match-title');
  const weightsKey = keys.conceptMatch(subjectId);

  let round = null;
  let source = 'sets';
  let selected = null; // { side: 'a' | 'b', id, button }
  let missed = {}; // pair id → true once a wrong pair included it
  let left = 0;
  let wrongTries = 0;
  let startedAt = 0;
  let clock = null;
  const hud = el('div', 'game-hud');
  const timer = el('span', 'game-score');
  const pairsLeft = el('span', 'game-streak');
  hud.append(timer, pairsLeft);
  board.before(hud);
  const tick = () => {
    timer.textContent = `⏱ ${formatTime(Date.now() - startedAt)}`;
  };

  function finish() {
    clearInterval(clock);
    const ms = Date.now() - startedAt;
    const results = Object.fromEntries(round.pairs.map((p) => [p.id, Boolean(missed[p.id])]));
    save(weightsKey, updateMatchWeights(load(weightsKey, {}), results));
    const clean = round.pairs.length - Object.keys(missed).length;
    const stars = starsFor(clean, round.pairs.length);
    // Best time per source and board size, only for rounds without a mistake and with every topic chosen.
    const bests = load(bestKey, {}) ?? {};
    const timeKey = topics.all() ? `${source}|${round.pairs.length}` : null;
    const { times, isNew } = timeKey && clean === round.pairs.length
      ? recordBestTime(bests.match, timeKey, ms)
      : { times: bests.match ?? {}, isNew: false };
    save(bestKey, { ...bests, match: times });

    const end = el('div', 'game-card game-end');
    end.setAttribute('role', 'status');
    end.append(el('p', 'game-kicker', 'סיימתם!'), starsEl(stars), el('p', 'game-end-score', `⏱ ${formatTime(ms)}`));
    if (isNew) end.append(el('p', 'game-new-best', 'שיא זמן חדש!'));
    const stats = el('p', 'meta game-end-stats');
    stats.append(el('span', null, `${clean} מתוך ${round.pairs.length} בלי טעות`), el('span', null, `ניסיונות שגויים ${wrongTries}`));
    if (!timeKey) stats.append(el('span', null, 'שיא זמן נקבע כשכל הנושאים נבחרו'));
    else if (Number.isFinite(times[timeKey])) stats.append(el('span', null, `הזמן הכי טוב ${formatTime(times[timeKey])}`));
    const again = button('primary', 'סבב נוסף', newRound);
    end.append(stats, again);
    board.append(end);
    status.textContent = '';
    again.focus();
  }

  function choose(side, id, btn) {
    // With motion off the shake never ends on its own, so the red mark goes on the next choice.
    for (const b of board.querySelectorAll('.is-wrong')) b.classList.remove('is-wrong');
    if (selected && selected.side === side) {
      selected.button.setAttribute('aria-pressed', 'false');
      if (selected.button === btn) {
        selected = null;
        return;
      }
    }
    if (!selected || selected.side === side) {
      selected = { side, id, button: btn };
      btn.setAttribute('aria-pressed', 'true');
      return;
    }
    const other = selected;
    selected = null;
    other.button.setAttribute('aria-pressed', 'false');
    if (other.id === id) {
      // Each matched pair gets its own colour and number, so the pairs read without colour too.
      const n = round.pairs.length - left + 1;
      for (const b of [other.button, btn]) {
        b.disabled = true;
        b.classList.add('is-done', `pair-${n}`);
        const badge = el('span', 'pair-badge', String(n));
        badge.setAttribute('aria-hidden', 'true');
        b.prepend(badge);
      }
      left -= 1;
      pairsLeft.textContent = `${round.pairs.length - left} מתוך ${round.pairs.length} זוגות`;
      const pair = round.pairs.find((p) => p.id === id);
      status.textContent = `נכון: ${pair.a} ← ${pair.b}`;
      if (left === 0) finish();
      else board.querySelector('.match-item:not(:disabled)')?.focus();
    } else {
      // The item on the left side is the one not known yet.
      missed[side === 'a' ? id : other.id] = true;
      wrongTries += 1;
      buzz();
      for (const b of [other.button, btn]) {
        b.classList.remove('is-wrong');
        void b.offsetWidth; // restart the shake
        b.classList.add('is-wrong');
      }
      status.textContent = 'לא מתאים, נסו שוב.';
    }
  }

  function item(side, id, text) {
    const btn = el('button', `match-item is-${side === 'a' ? 'name' : 'text'}`, fmt(text));
    btn.type = 'button';
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => choose(side, id, btn));
    btn.addEventListener('animationend', () => btn.classList.remove('is-wrong'));
    return btn;
  }

  function newRound() {
    source = document.querySelector('input[name="match-source"]:checked').value;
    round = buildMatchRound(bank, { topics: topics.chosen(), source, weights: load(weightsKey, {}) });
    selected = null;
    missed = {};
    wrongTries = 0;
    clearInterval(clock);
    if (!round) {
      title.textContent = '';
      pairsLeft.textContent = '';
      timer.textContent = '';
      status.textContent = 'אין מספיק זוגות לבחירה הזו. בחרו עוד נושאים או סוג אחר.';
      board.replaceChildren();
      return;
    }
    left = round.pairs.length;
    startedAt = Date.now();
    tick();
    clock = setInterval(() => {
      // Stop counting when the game is not on screen.
      if (board.offsetParent === null) clearInterval(clock);
      else tick();
    }, 500);
    pairsLeft.textContent = `0 מתוך ${round.pairs.length} זוגות`;
    title.textContent = round.title;
    const byId = new Map(round.pairs.map((p) => [p.id, p]));
    const first = el('div', 'match-col');
    first.setAttribute('role', 'group');
    first.setAttribute('aria-label', 'פריטים');
    first.append(...round.pairs.map((p) => item('a', p.id, p.a)));
    const second = el('div', 'match-col');
    second.setAttribute('role', 'group');
    second.setAttribute('aria-label', 'התאמות');
    second.append(...round.bOrder.map((id) => item('b', id, byId.get(id).b)));
    board.replaceChildren(first, second);
    status.textContent = `${round.pairs.length} זוגות. בחרו פריט ואת מה שמתאים לו.`;
  }

  $('match-new').addEventListener('click', newRound);
  for (const control of document.querySelectorAll('input[name="match-source"]')) control.addEventListener('change', newRound);
  return newRound;
}
