import {
  MASTERY_STREAK,
  answer,
  createSession,
  currentQuestion,
  isComplete,
  isSessionCompatible,
  isolateNumberRanges as fmt,
  listTopics,
  presentOptions,
  progressInfo,
  questionById,
  questionIdsForTopics,
  recordResult,
  skip,
  summarize,
} from './core.js';
import { loadQuizFromUrl, quizPlace } from './load-quiz.js';
import { keys, load, prefs, remove, save } from './storage.js';

const $ = (id) => document.getElementById(id);
const ui = {
  toStart: $('to-start'),
  subject: $('subject'),
  title: $('quiz-title'),
  status: $('status'),
  // start
  start: $('start'),
  description: $('description'),
  resumeBox: $('resume-box'),
  resumeText: $('resume-text'),
  resume: $('resume'),
  newSession: $('new-session'),
  allTopics: $('all-topics'),
  noTopics: $('no-topics'),
  topicList: $('topic-list'),
  startButton: $('start-button'),
  best: $('best'),
  printLink: $('print-link'),
  // play
  play: $('play'),
  ring: $('ring'),
  ringFill: $('ring-fill'),
  ringMastered: $('ring-mastered'),
  ringTotal: $('ring-total'),
  progressText: $('progress-text'),
  topic: $('topic'),
  retryLabel: $('retry-label'),
  question: $('question'),
  options: $('options'),
  skip: $('skip'),
  feedback: $('feedback'),
  countdown: $('countdown'),
  autoToggle: $('auto-advance'),
  verdict: $('verdict'),
  explanation: $('explanation'),
  note: $('note'),
  requeueHint: $('requeue-hint'),
  next: $('next'),
  // done
  done: $('done'),
  scorePercent: $('score-percent'),
  score: $('score'),
  retryMissed: $('retry-missed'),
  newPractice: $('new-practice'),
  weakTopics: $('weak-topics'),
  noWeak: $('no-weak'),
  retriedTitle: $('retried-title'),
  retried: $('retried'),
  noRetried: $('no-retried'),
};

const MODE_LABELS = { full: 'כל הבוחן', topics: 'נושאים נבחרים', retry: 'שאלות שחזרו' };
const LETTERS = ['א', 'ב', 'ג', 'ד'];
// After a correct answer, move on by itself unless the user asked for less motion.
// The pause scales with the text the learner has to read (explanation plus note).
const AUTO_ADVANCE_MIN_MS = 2500;
const AUTO_ADVANCE_MAX_MS = 8000;
const AUTO_ADVANCE_BASE_MS = 1500;
const AUTO_ADVANCE_PER_CHAR_MS = 45;

let quiz = null;
let state = null;
// 'start' → choosing; 'question' → waiting for an answer; 'feedback' → showing the result; 'done' → end screen.
let phase = 'start';
let optionButtons = [];
let lastSummary = null;
let autoAdvance = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cancelAutoAdvance() {
  clearTimeout(autoAdvance);
  ui.countdown.hidden = true;
}

function show(section) {
  cancelAutoAdvance();
  for (const s of [ui.start, ui.play, ui.done]) s.hidden = s !== section;
  // The ring and session stats belong to a running (or just finished) session.
  ui.ring.hidden = section === ui.start;
  ui.progressText.hidden = section === ui.start;
  ui.status.hidden = true;
  ui.toStart.hidden = section === ui.start;
  window.scrollTo({ top: 0 });
}

function showStatus(text) {
  ui.status.textContent = text;
  ui.status.hidden = false;
  for (const s of [ui.start, ui.play, ui.done]) s.hidden = true;
  ui.ring.hidden = true;
  ui.progressText.hidden = true;
}

function persist() {
  if (isComplete(state)) remove(keys.session(quiz.id));
  else save(keys.session(quiz.id), state);
}

function loadSavedSession() {
  const saved = load(keys.session(quiz.id));
  return saved && isSessionCompatible(saved, quiz) && !isComplete(saved) ? saved : null;
}

// ---------- start screen ----------

// A mixed practice is chosen by unit ("group"); a single quiz by topic.
const selectionField = () => (quiz.mixed ? 'group' : 'topic');

function topicCheckboxes() {
  return [...ui.topicList.querySelectorAll('input[type="checkbox"]')];
}

function selectedQuestionIds() {
  const topics = topicCheckboxes().filter((c) => c.checked).map((c) => c.value);
  return questionIdsForTopics(quiz, topics, selectionField());
}

function updateStartButton() {
  const count = selectedQuestionIds().length;
  ui.startButton.disabled = count === 0;
  ui.startButton.textContent = count === 0 ? 'בחרו לפחות נושא אחד' : `התחל · ${count} שאלות`;
}

function renderTopics() {
  ui.topicList.replaceChildren(...listTopics(quiz, selectionField()).map(({ topic, count }) => {
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

  const results = load(keys.results(quiz.id));
  ui.best.hidden = !(results && Number.isFinite(results.bestPercent));
  if (!ui.best.hidden) {
    ui.best.textContent = `שיא בניסיון ראשון על כל הבוחן: ${results.bestPercent}% · ${results.attempts} סבבים שהושלמו`;
  }
  (saved ? ui.resume : ui.startButton).focus({ preventScroll: true });
}

function begin(questionIds, mode) {
  if (loadSavedSession() && !window.confirm('התרגול הפתוח יימחק. להתחיל תרגול חדש?')) return;
  state = createSession(quiz, Math.random, { questionIds, mode });
  persist();
  renderQuestion();
}

function onStartSubmit(event) {
  event.preventDefault();
  const ids = selectedQuestionIds();
  if (ids.length === 0) return;
  begin(ids, ids.length === quiz.questions.length ? 'full' : 'topics');
}

// ---------- play ----------

function stat(label, value) {
  const span = el('span', null, `${label}: `);
  span.append(el('strong', null, value));
  return span;
}

function renderProgress() {
  const { mastered, total, queueSize } = progressInfo(state);
  const firstTries = Object.values(state.progress).map((p) => p.firstTry).filter((t) => t !== null);
  const firstOk = firstTries.filter((t) => t === 'correct').length;

  const fraction = total === 0 ? 0 : mastered / total;
  ui.ringFill.setAttribute('stroke-dashoffset', String(100 * (1 - fraction)));
  ui.ringFill.classList.toggle('is-empty', mastered === 0);
  ui.ringMastered.textContent = String(mastered);
  ui.ringTotal.textContent = `מתוך ${total}`;
  ui.ring.setAttribute('aria-label', `נשלטו ${mastered} מתוך ${total}`);

  ui.progressText.replaceChildren(
    stat('בתור', String(queueSize)),
    ' ',
    stat('נכון בניסיון ראשון', `${firstOk}/${firstTries.length}`),
  );
}

// The learner's explicit choice wins; until they make one, stop-motion / reduced motion means off.
function autoAdvanceOn() {
  const chosen = load(prefs.autoAdvance);
  return typeof chosen === 'boolean' ? chosen : !prefersLessMotion();
}

function prefersLessMotion() {
  return document.documentElement.dataset.motion === 'off'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function renderQuestion() {
  phase = 'question';
  show(ui.play);
  const question = currentQuestion(state, quiz);
  ui.feedback.hidden = true;
  ui.skip.disabled = false;
  ui.next.disabled = true;
  renderProgress();

  ui.topic.textContent = question.topic;
  const { attempts } = state.progress[question.id];
  ui.retryLabel.hidden = attempts === 0;
  ui.retryLabel.textContent = `שאלה חוזרת · ניסיון ${attempts + 1}`;
  ui.question.textContent = fmt(question.question);

  optionButtons = presentOptions(question).map((opt, i) => {
    const button = el('button', 'option');
    button.type = 'button';
    button.dataset.index = String(opt.index);
    button.append(el('span', 'letter', LETTERS[i]), el('span', 'option-text', fmt(opt.text)));
    button.addEventListener('click', () => choose(opt.index));
    return button;
  });
  ui.options.replaceChildren(...optionButtons.map((b) => {
    const li = el('li');
    li.append(b);
    return li;
  }));
  // The previous focus (an option or "next") is now disabled or gone; start the new question there.
  ui.question.focus({ preventScroll: true });
}

function showFeedback(result, chosenIndex) {
  phase = 'feedback';
  const { question, correct, progress } = result;

  for (const button of optionButtons) {
    const index = Number(button.dataset.index);
    button.disabled = true;
    if (index === question.correct) button.classList.add('is-correct');
    else if (index === chosenIndex) button.classList.add('is-wrong');
    else button.classList.add('is-dim');
  }
  ui.skip.disabled = true;
  ui.next.disabled = false;

  if (chosenIndex === null) ui.verdict.textContent = 'דילגת. התשובה הנכונה מסומנת.';
  else ui.verdict.textContent = correct ? 'נכון!' : 'לא נכון.';
  ui.feedback.className = `feedback ${correct ? 'good' : 'bad'}`;
  ui.explanation.textContent = fmt(question.explanation);

  const note = chosenIndex === null ? '' : question.options[chosenIndex].note ?? '';
  ui.note.hidden = note.trim() === '';
  ui.note.textContent = fmt(correct ? note : `על התשובה שבחרת: ${note}`);

  let hint = '';
  if (!progress.mastered) {
    const remaining = MASTERY_STREAK - progress.streak;
    hint = remaining === 1
      ? 'השאלה תחזור בהמשך. עוד תשובה נכונה אחת והיא נשלטת.'
      : `השאלה תחזור בהמשך. צריך ${remaining} תשובות נכונות ברצף.`;
  }
  ui.requeueHint.textContent = hint;
  ui.requeueHint.hidden = hint === '';

  ui.feedback.hidden = false;
  renderProgress();
  ui.next.focus({ preventScroll: true });
  if (correct) startAutoAdvance();
}

// Auto-advance only follows a correct answer, and only while the learner has it switched on.
function startAutoAdvance() {
  cancelAutoAdvance();
  if (phase !== 'feedback' || !ui.feedback.classList.contains('good') || !autoAdvanceOn()) return;
  const chars = ui.explanation.textContent.length + (ui.note.hidden ? 0 : ui.note.textContent.length);
  const delay = Math.min(AUTO_ADVANCE_MAX_MS, Math.max(AUTO_ADVANCE_MIN_MS, AUTO_ADVANCE_BASE_MS + chars * AUTO_ADVANCE_PER_CHAR_MS));
  autoAdvance = setTimeout(next, delay);
  // Visual countdown; restart the animation by toggling hidden.
  ui.countdown.hidden = true;
  ui.countdown.style.setProperty('--countdown', `${delay}ms`);
  void ui.countdown.offsetWidth;
  ui.countdown.hidden = false;
}

function apply(result, chosenIndex) {
  state = result.state;
  persist();
  // Best score only means something for a run over the whole of one quiz.
  if (isComplete(state) && state.mode === 'full' && !quiz.mixed) {
    const summary = summarize(state, quiz);
    save(keys.results(quiz.id), recordResult(load(keys.results(quiz.id)), summary, new Date().toISOString()));
  }
  showFeedback(result, chosenIndex);
}

function choose(optionIndex) {
  if (phase !== 'question') return;
  apply(answer(state, quiz, optionIndex), optionIndex);
}

function skipQuestion() {
  if (phase !== 'question') return;
  apply(skip(state, quiz), null);
}

function next() {
  cancelAutoAdvance();
  if (phase !== 'feedback') return;
  if (isComplete(state)) renderDone();
  else renderQuestion();
}

// ---------- end screen ----------

function renderRetried(summary) {
  return summary.retried.map((r) => {
    const q = questionById(quiz, r.id);
    const details = el('details', 'retried-item');
    const head = el('summary');
    head.append(
      el('b', null, r.misses === 1 ? 'טעות אחת' : `${r.misses} טעויות`),
      document.createTextNode(` · ${fmt(q.question)}`),
    );
    details.append(
      head,
      el('p', 'answer', `תשובה נכונה: ${fmt(q.options[q.correct].text)}`),
      el('p', 'muted', fmt(q.explanation)),
    );
    return details;
  });
}

function renderDone() {
  phase = 'done';
  show(ui.done);
  const summary = summarize(state, quiz);
  lastSummary = summary;

  ui.scorePercent.textContent = `${summary.firstTryPercent}%`;
  ui.score.textContent = `${summary.firstTryCorrect} מתוך ${summary.total} שאלות נענו נכון בפעם הראשונה.`;

  ui.weakTopics.replaceChildren(...summary.weakTopics.map((t) => {
    const li = el('li');
    const bar = el('span', 'bar');
    bar.setAttribute('aria-hidden', 'true');
    const fill = el('i');
    fill.style.inlineSize = `${Math.round(t.rate * 100)}%`;
    bar.append(fill);
    li.append(el('span', null, t.topic), el('span', 'count', `${t.missed} מתוך ${t.total} חזרו`), bar);
    return li;
  }));
  ui.noWeak.hidden = summary.weakTopics.length > 0;

  ui.retriedTitle.textContent = summary.retried.length > 0
    ? `שאלות שחזרו (${summary.retried.length})`
    : 'שאלות שחזרו';
  ui.retried.replaceChildren(...renderRetried(summary));
  ui.noRetried.hidden = summary.retried.length > 0;

  ui.retryMissed.hidden = summary.retried.length === 0;
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
  const digit = /^(?:Digit|Numpad)([1-4])$/.exec(event.code);
  if (phase === 'question' && digit) {
    const button = optionButtons[Number(digit[1]) - 1];
    if (button) {
      event.preventDefault();
      button.click();
    }
  } else if ((phase === 'question' || phase === 'feedback') && event.code === 'KeyA') {
    event.preventDefault();
    ui.autoToggle.click();
  } else if (phase === 'question' && event.code === 'KeyS') {
    event.preventDefault();
    skipQuestion();
  } else if (phase === 'feedback' && (event.key === 'Enter' || event.key === ' ')) {
    // A focused button already handles Enter/Space natively; avoid a double advance.
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement || event.target instanceof HTMLInputElement) return;
    event.preventDefault();
    next();
  }
}

async function main() {
  try {
    quiz = await loadQuizFromUrl();
  } catch (err) {
    showStatus(err.message);
    return;
  }

  // Kicker shows the subject and, when present, the unit: "אנטומיה ופיזיולוגיה · הלב".
  const place = quizPlace(quiz);
  document.title = `${quiz.title} · ${place}`;
  ui.subject.textContent = place;
  ui.title.textContent = quiz.title;
  // Same ?id= or ?subject= as this page, so mixed practice prints mixed too.
  ui.printLink.href = `print.html${location.search}`;
  ui.description.textContent = quiz.description ?? '';
  ui.description.hidden = !quiz.description;

  ui.toStart.addEventListener('click', renderStart);
  ui.resume.addEventListener('click', () => {
    state = loadSavedSession();
    if (state) renderQuestion();
    else renderStart();
  });
  ui.newSession.addEventListener('submit', onStartSubmit);
  ui.allTopics.addEventListener('click', () => {
    for (const c of topicCheckboxes()) c.checked = true;
    updateStartButton();
  });
  ui.noTopics.addEventListener('click', () => {
    for (const c of topicCheckboxes()) c.checked = false;
    updateStartButton();
  });
  ui.autoToggle.checked = autoAdvanceOn();
  ui.autoToggle.addEventListener('change', () => {
    save(prefs.autoAdvance, ui.autoToggle.checked);
    if (ui.autoToggle.checked) startAutoAdvance();
    else cancelAutoAdvance();
  });
  ui.skip.addEventListener('click', skipQuestion);
  ui.next.addEventListener('click', next);
  // Touching the explanation means the learner is still reading: stop the automatic advance.
  ui.feedback.addEventListener('pointerdown', cancelAutoAdvance);
  ui.retryMissed.addEventListener('click', retryMissed);
  ui.newPractice.addEventListener('click', renderStart);
  document.addEventListener('keydown', onKeyDown);

  renderTopics();
  renderStart();
}

main();
