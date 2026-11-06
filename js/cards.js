// Flashcard study page (cards.html?id=<deck id>): start (resume / topics) -> play -> end.
// Same rules as the quizzes (see cards-core.js). All text is set with textContent.
import { MASTERY_STREAK, isolateNumberRanges as fmt, isValidQuizId } from './core.js';
import {
  cardIdsForTopics,
  createCardSession,
  currentCard,
  isCardSessionCompatible,
  isComplete,
  listCardTopics,
  progressInfo,
  rate,
  recordResult,
  summarizeDeck,
  topicOf,
  validateDeck,
} from './cards-core.js';
import { ecgPath } from './ecg.js';
import { keys, load, remove, save } from './storage.js';

const $ = (id) => document.getElementById(id);
const ui = {
  toStart: $('to-start'), subject: $('subject'), title: $('deck-title'), status: $('status'),
  start: $('start'), description: $('description'), resumeBox: $('resume-box'), resumeText: $('resume-text'),
  resume: $('resume'), newSession: $('new-session'), allTopics: $('all-topics'), noTopics: $('no-topics'),
  topicList: $('topic-list'), startButton: $('start-button'), best: $('best'),
  play: $('play'), trace: $('trace'), progressText: $('progress-text'), lastRating: $('last-rating'),
  topic: $('topic'), retryLabel: $('retry-label'), front: $('card-front'), backBox: $('back-box'),
  back: $('card-back'), reveal: $('reveal'), rating: $('rating'), known: $('known'), unknown: $('unknown'),
  done: $('done'), scorePercent: $('score-percent'), score: $('score'), retryMissed: $('retry-missed'),
  newPractice: $('new-practice'), weakTopics: $('weak-topics'), noWeak: $('no-weak'),
  retriedTitle: $('retried-title'), retried: $('retried'), noRetried: $('no-retried'),
};

const MODE_LABELS = { full: 'כל החפיסה', topics: 'נושאים נבחרים', retry: 'כרטיסיות שחזרו' };

let deck = null;
let state = null;
// 'start' → choosing; 'front' → question shown; 'back' → answer shown, waiting for a rating; 'done' → end screen.
let phase = 'start';
let lastSummary = null;
let lastRating = '';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function show(section) {
  for (const s of [ui.start, ui.play, ui.done]) s.hidden = s !== section;
  ui.status.hidden = true;
  ui.toStart.hidden = section === ui.start;
  window.scrollTo({ top: 0 });
}

function showStatus(text) {
  ui.status.textContent = text;
  ui.status.hidden = false;
  for (const s of [ui.start, ui.play, ui.done]) s.hidden = true;
}

function persist() {
  if (isComplete(state)) remove(keys.cardSession(deck.id));
  else save(keys.cardSession(deck.id), state);
}

function loadSavedSession() {
  const saved = load(keys.cardSession(deck.id));
  return saved && isCardSessionCompatible(saved, deck) && !isComplete(saved) ? saved : null;
}

// ---------- start screen ----------

const topicCheckboxes = () => [...ui.topicList.querySelectorAll('input[type="checkbox"]')];

function selectedCardIds() {
  return cardIdsForTopics(deck, topicCheckboxes().filter((c) => c.checked).map((c) => c.value));
}

function updateStartButton() {
  const count = selectedCardIds().length;
  ui.startButton.disabled = count === 0;
  ui.startButton.textContent = count === 0 ? 'בחרו לפחות נושא אחד' : `התחל · ${count} כרטיסיות`;
}

function renderTopics() {
  ui.topicList.replaceChildren(...listCardTopics(deck).map(({ topic, count }) => {
    const li = el('li');
    const label = el('label', 'topic-option');
    const box = el('input');
    box.type = 'checkbox';
    box.value = topic;
    box.checked = true;
    box.addEventListener('change', updateStartButton);
    label.append(box, el('span', null, topic), el('span', 'count', String(count)));
    li.append(label);
    return li;
  }));
  updateStartButton();
}

function renderStart() {
  phase = 'start';
  show(ui.start);
  const saved = loadSavedSession();
  ui.resumeBox.hidden = !saved;
  if (saved) {
    const { mastered, total } = progressInfo(saved);
    ui.resumeText.textContent = `יש תרגול פתוח (${MODE_LABELS[saved.mode]}): נשלטו ${mastered} מתוך ${total}.`;
  }
  const results = load(keys.cardResults(deck.id));
  ui.best.hidden = !(results && Number.isFinite(results.bestPercent));
  if (!ui.best.hidden) {
    ui.best.textContent = `שיא בניסיון ראשון על כל החפיסה: ${results.bestPercent}% · ${results.attempts} סבבים שהושלמו`;
  }
  (saved ? ui.resume : ui.startButton).focus({ preventScroll: true });
}

function begin(cardIds, mode) {
  if (loadSavedSession() && !window.confirm('התרגול הפתוח יימחק. להתחיל תרגול חדש?')) return;
  state = createCardSession(deck, Math.random, { cardIds, mode });
  lastRating = '';
  persist();
  renderFront();
}

function onStartSubmit(event) {
  event.preventDefault();
  const ids = selectedCardIds();
  if (ids.length === 0) return;
  begin(ids, ids.length === deck.cards.length ? 'full' : 'topics');
}

// ---------- play ----------

function renderProgress() {
  const { mastered, total, queueSize } = progressInfo(state);
  ui.trace.setAttribute('d', ecgPath(total === 0 ? 0 : mastered / total));
  ui.progressText.replaceChildren(
    el('span', null, `נשלטו ${mastered} מתוך ${total}`),
    el('span', null, `בתור: ${queueSize}`),
  );
}

function renderFront() {
  phase = 'front';
  show(ui.play);
  const card = currentCard(state, deck);
  renderProgress();

  ui.lastRating.textContent = lastRating;
  ui.lastRating.hidden = lastRating === '';
  ui.topic.textContent = topicOf(card);
  const { attempts } = state.progress[card.id];
  ui.retryLabel.hidden = attempts === 0;
  ui.retryLabel.textContent = `חוזר · ניסיון ${attempts + 1}`;
  ui.front.textContent = fmt(card.front);

  // The answer is not in the accessibility tree until it is revealed.
  ui.backBox.hidden = true;
  ui.back.textContent = '';
  ui.rating.hidden = true;
  ui.reveal.hidden = false;
  // Focus the question so a screen reader reads the new card; Tab then reaches the reveal button.
  ui.front.focus({ preventScroll: true });
}

function revealBack() {
  if (phase !== 'front') return;
  phase = 'back';
  const card = currentCard(state, deck);
  ui.back.textContent = fmt(card.back);
  ui.backBox.hidden = false;
  ui.reveal.hidden = true;
  ui.rating.hidden = false;
  ui.back.focus({ preventScroll: true });
}

function rateCard(known) {
  if (phase !== 'back') return;
  const result = rate(state, deck, known);
  state = result.state;
  persist();
  // Best score only means something for a run over the whole deck.
  if (isComplete(state) && state.mode === 'full') {
    const summary = summarizeDeck(state, deck);
    save(keys.cardResults(deck.id), recordResult(load(keys.cardResults(deck.id)), summary, new Date().toISOString()));
  }

  if (result.progress.mastered) lastRating = 'הכרטיס הקודם: נשלט ✓';
  else {
    const remaining = MASTERY_STREAK - result.progress.streak;
    lastRating = remaining === 1
      ? 'הכרטיס הקודם יחזור בהמשך. עוד "ידעתי" אחד והוא נשלט.'
      : `הכרטיס הקודם יחזור בהמשך. צריך ${remaining} פעמים "ידעתי" ברצף.`;
  }
  if (isComplete(state)) renderDone();
  else renderFront();
}

// ---------- end screen ----------

function renderRetried(summary) {
  return summary.retried.map((r) => {
    const card = deck.cards.find((c) => c.id === r.id);
    const details = el('details', 'retried-item');
    const head = el('summary');
    head.append(
      el('b', null, r.misses === 1 ? 'לא ידעתי פעם אחת' : `לא ידעתי ${r.misses} פעמים`),
      document.createTextNode(` · ${fmt(card.front)}`),
    );
    details.append(head, el('p', 'answer', fmt(card.back)));
    return details;
  });
}

function renderDone() {
  phase = 'done';
  show(ui.done);
  const summary = summarizeDeck(state, deck);
  lastSummary = summary;

  ui.scorePercent.textContent = `${summary.firstTryPercent}%`;
  ui.score.textContent = `${summary.firstTryCorrect} מתוך ${summary.total} כרטיסיות ידעתם בפעם הראשונה.`;

  ui.weakTopics.replaceChildren(...summary.weakTopics.map((t) => {
    const li = el('li');
    const bar = el('span', 'bar');
    const fill = el('i');
    fill.style.inlineSize = `${Math.round(t.rate * 100)}%`;
    bar.append(fill);
    li.append(el('span', null, t.topic), bar, el('span', 'count', `${t.missed}/${t.total}`));
    return li;
  }));
  ui.noWeak.hidden = summary.weakTopics.length > 0;

  ui.retriedTitle.textContent = summary.retried.length > 0 ? `כרטיסיות שחזרו (${summary.retried.length})` : 'כרטיסיות שחזרו';
  ui.retried.replaceChildren(...renderRetried(summary));
  ui.noRetried.hidden = summary.retried.length > 0;

  ui.retryMissed.hidden = summary.retried.length === 0;
  ui.retryMissed.textContent = `תרגל רק את ${summary.retried.length} הכרטיסיות שחזרו`;
  (ui.retryMissed.hidden ? ui.newPractice : ui.retryMissed).focus({ preventScroll: true });
}

function retryMissed() {
  if (!lastSummary || lastSummary.retried.length === 0) return;
  begin(lastSummary.retried.map((r) => r.id), 'retry');
}

// ---------- wiring ----------

function onKeyDown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  // event.code is layout-independent, so shortcuts work with a Hebrew keyboard too.
  const digit = /^(?:Digit|Numpad)([12])$/.exec(event.code);
  if (phase === 'back' && digit) {
    event.preventDefault();
    rateCard(digit[1] === '1');
  } else if (phase === 'front' && (event.key === ' ' || event.key === 'Enter')) {
    // A focused button/link already handles Enter/Space natively; avoid a double action.
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return;
    event.preventDefault();
    revealBack();
  }
}

async function main() {
  const id = new URLSearchParams(location.search).get('id');
  if (!isValidQuizId(id)) {
    showStatus('לא נבחרה חפיסה.');
    return;
  }
  try {
    const res = await fetch(`flashcards/${id}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    deck = await res.json();
  } catch (err) {
    console.error(err);
    showStatus(location.protocol === 'file:'
      ? 'יש להריץ דרך שרת (npm run serve), הדפדפן חוסם טעינה מקובץ מקומי.'
      : 'לא הצלחנו לטעון את החפיסה.');
    return;
  }
  const errors = validateDeck(deck);
  if (errors.length > 0) {
    console.error('Invalid deck file:', errors);
    showStatus('קובץ החפיסה פגום. פרטים בקונסול.');
    return;
  }

  const place = deck.unit ? `${deck.subject} · ${deck.unit}` : deck.subject;
  document.title = `${deck.title} · ${place}`;
  ui.subject.textContent = `כרטיסיות · ${place}`;
  ui.title.textContent = deck.title;
  ui.description.textContent = deck.description ?? '';
  ui.description.hidden = !deck.description;

  ui.toStart.addEventListener('click', renderStart);
  ui.resume.addEventListener('click', () => {
    state = loadSavedSession();
    lastRating = '';
    if (state) renderFront();
    else renderStart();
  });
  ui.newSession.addEventListener('submit', onStartSubmit);
  ui.allTopics.addEventListener('click', () => { for (const c of topicCheckboxes()) c.checked = true; updateStartButton(); });
  ui.noTopics.addEventListener('click', () => { for (const c of topicCheckboxes()) c.checked = false; updateStartButton(); });
  ui.reveal.addEventListener('click', revealBack);
  ui.known.addEventListener('click', () => rateCard(true));
  ui.unknown.addEventListener('click', () => rateCard(false));
  ui.retryMissed.addEventListener('click', retryMissed);
  ui.newPractice.addEventListener('click', renderStart);
  document.addEventListener('keydown', onKeyDown);

  renderTopics();
  renderStart();
}

main();
