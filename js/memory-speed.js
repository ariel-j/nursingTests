// Speed mode: a use (or a drug name) and four options against a shrinking clock.
// Recognising the right option without seeing the pair is what lifts a drug to "mastered".
import { answerSpeed, createSpeed, finishSpeed, speedMultiplier } from './memory-core.js';
import { drugDetail } from './memory-detail.js';
import { clear, countUp, drugName, el, ltr } from './memory-dom.js';
import { sound, vibrate } from './memory-fx.js';

const TICK_MS = 100;
const LETTERS = ['א', 'ב', 'ג', 'ד'];

const PROMPTS = {
  toName: 'איזו תרופה משמשת לטיפול הזה?',
  toUse: 'מה השימוש בתרופה?',
};

export function playSpeed({ root, ids, drugs, byId, rng, relaxed, announce, onFinish, onExit }) {
  let state = createSpeed(ids, drugs, rng);
  let msLeft = 0;
  let lastTick = 0;
  let timer = null;
  let answered = false;
  let shownScore = 0;

  // ----- layout -----
  const hud = el('div', 'hud');
  const mkItem = (label) => {
    const item = el('div', 'hud-item');
    const value = el('span', 'hud-value', '');
    item.append(el('span', 'hud-label', label), value);
    return { item, value };
  };
  const score = mkItem('ניקוד');
  const streak = mkItem('רצף');
  const count = mkItem('שאלה');
  const exit = el('button', 'link-button hud-exit', 'יציאה');
  exit.type = 'button';
  hud.append(score.item, streak.item, count.item, exit);

  const clock = el('div', 'timer-bar');
  clock.setAttribute('aria-hidden', 'true');
  clock.append(el('i'));
  clock.hidden = relaxed;

  const card = el('article', 'card speed-card');
  const label = el('p', 'kicker');
  const prompt = el('h2', 'question speed-prompt');
  const options = el('ol', 'options');
  const feedback = el('div', 'feedback speed-feedback');
  feedback.setAttribute('role', 'status');
  feedback.hidden = true;
  card.append(label, prompt, options, feedback);

  root.replaceChildren(hud, clock, card);

  // ----- hud -----
  function renderHud() {
    countUp(score.value, state.score, 350, shownScore);
    shownScore = state.score;
    streak.value.textContent = state.streak >= 1 ? ltr(`🔥 ×${speedMultiplier(state.streak)}`) : ltr('×1');
    streak.item.classList.toggle('is-hot', state.streak >= 2);
    count.value.textContent = `${answered ? state.index : state.index + 1}/${state.questions.length}`;
  }

  function setClock() {
    const q = state.questions[state.index];
    clock.firstChild.style.setProperty('--left', String(Math.max(0, msLeft / q.ms)));
    clock.classList.toggle('is-low', msLeft / q.ms < 0.3);
  }

  function stopTimer() {
    clearInterval(timer);
    timer = null;
  }

  function stop() {
    stopTimer();
    document.removeEventListener('keydown', onKey);
  }

  // ----- a question -----
  function optionContent(q, drugId) {
    return q.direction === 'toName' ? drugName(byId.get(drugId).name, 'span') : document.createTextNode(byId.get(drugId).indication);
  }

  function showQuestion() {
    const q = state.questions[state.index];
    const drug = byId.get(q.drugId);
    answered = false;
    feedback.hidden = true;
    clear(feedback);
    label.textContent = PROMPTS[q.direction];
    clear(prompt);
    if (q.direction === 'toName') prompt.textContent = drug.indication;
    else prompt.append(drugName(drug.name));

    clear(options);
    q.options.forEach((id, i) => {
      const item = el('li');
      const btn = el('button', 'option');
      btn.type = 'button';
      btn.append(el('span', 'letter', LETTERS[i]));
      const text = el('span', 'option-text');
      text.append(optionContent(q, id));
      btn.append(text);
      btn.addEventListener('click', () => choose(i));
      item.append(btn);
      options.append(item);
    });

    renderHud();
    if (!relaxed) {
      msLeft = q.ms;
      lastTick = performance.now();
      setClock();
      timer = setInterval(() => {
        const now = performance.now();
        msLeft -= Math.min(now - lastTick, 1000);
        lastTick = now;
        if (msLeft <= 0) {
          msLeft = 0;
          setClock();
          choose(null);
        } else {
          setClock();
        }
      }, TICK_MS);
    }
    announce(`${PROMPTS[q.direction]} ${q.direction === 'toName' ? drug.indication : drug.name}`);
  }

  function choose(choice) {
    if (answered || state.done) return;
    answered = true;
    stopTimer();
    const q = state.questions[state.index];
    const { state: next, event } = answerSpeed(state, choice, relaxed ? q.ms / 2 : msLeft);
    state = next;

    [...options.children].forEach((item, i) => {
      const btn = item.firstChild;
      btn.setAttribute('aria-disabled', 'true');
      if (i === q.correctIndex) btn.classList.add('is-correct');
      else if (i === choice) btn.classList.add('is-wrong');
      else btn.classList.add('is-dim');
    });

    const good = event.type === 'correct';
    sound(good ? 'match' : 'miss', Math.max(1, event.streak));
    vibrate(good ? 15 : [40, 30, 40]);
    const verdict = good ? `נכון! ${ltr(`+${event.points}`)}` : event.type === 'timeout' ? 'נגמר הזמן' : 'לא נכון';
    feedback.classList.toggle('good', good);
    feedback.classList.toggle('bad', !good);
    feedback.append(el('p', 'verdict', verdict), drugDetail(byId.get(q.drugId)));
    const next2 = el('button', 'primary', state.done ? 'לתוצאות' : 'הבא');
    next2.type = 'button';
    next2.addEventListener('click', () => {
      if (state.done) onFinish(finishSpeed(state));
      else showQuestion();
    });
    feedback.append(next2);
    feedback.hidden = false;
    next2.focus({ preventScroll: true });
    feedback.scrollIntoView({ block: 'nearest', behavior: 'auto' });

    announce(verdict);
    renderHud();
  }

  function onKey(e) {
    const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (m && !answered && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      choose(Number(m[1]) - 1);
    }
  }

  exit.addEventListener('click', () => { stop(); onExit(); });
  document.addEventListener('keydown', onKey);
  showQuestion();
  return { stop };
}
