import {
  MASTERY_STREAK,
  STARRED_QUIZ_ID,
  answer,
  combineQuizzes,
  combinedSessionQuizIds,
  createSession,
  currentQuestion,
  isComplete,
  isSessionCompatible,
  isolateNumberRanges as fmt,
  isValidQuizId,
  listTopics,
  manifestQuizzes,
  presentOptions,
  progressInfo,
  questionById,
  questionIdsForTopics,
  recordResult,
  skip,
  starredIds,
  summarize,
  toggleStar,
  validateQuiz,
} from './core.js';
import { ecgPath } from './ecg.js';
import { keys, load, remove, save } from './storage.js';

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
  starredBox: $('starred-box'),
  practiceStarred: $('practice-starred'),
  starredList: $('starred-list'),
  newSession: $('new-session'),
  topicsLegend: $('topics-legend'),
  allTopics: $('all-topics'),
  noTopics: $('no-topics'),
  topicList: $('topic-list'),
  startButton: $('start-button'),
  best: $('best'),
  // play
  play: $('play'),
  trace: $('trace'),
  progressText: $('progress-text'),
  topic: $('topic'),
  retryLabel: $('retry-label'),
  star: $('star'),
  question: $('question'),
  options: $('options'),
  skip: $('skip'),
  feedback: $('feedback'),
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

const MODE_LABELS = { full: 'כל הבוחן', topics: 'נושאים נבחרים', retry: 'שאלות שחזרו', starred: 'שאלות מסומנות' };

let quiz = null;
// True on quiz.html?starred: `quiz` is the in-memory combination of several quizzes.
let combined = false;
let state = null;
// The question on screen; after answering, `state` already points at the next one.
let shownQuestion = null;
// 'start' → choosing; 'question' → waiting for an answer; 'feedback' → showing the result; 'done' → end screen.
let phase = 'start';
let optionButtons = [];
let lastSummary = null;

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
  if (isComplete(state)) remove(keys.session(quiz.id));
  else save(keys.session(quiz.id), state);
}

function loadSavedSession() {
  const saved = load(keys.session(quiz.id));
  return saved && isSessionCompatible(saved, quiz) && !isComplete(saved) ? saved : null;
}

// ---------- stars ----------

function loadStars(quizId) {
  const list = load(keys.starred(quizId), []);
  return Array.isArray(list) ? list : [];
}

// Where a question's star is stored: its own quiz, also for a question in the combined quiz.
function starRef(question) {
  return question.source ?? { quizId: quiz.id, questionId: question.id };
}

function isStarred(question) {
  const { quizId, questionId } = starRef(question);
  return loadStars(quizId).includes(questionId);
}

/** Flips the question's star in storage and returns whether it is now starred. */
function flipStar(question) {
  const { quizId, questionId } = starRef(question);
  const next = toggleStar(loadStars(quizId), questionId);
  if (next.length === 0) remove(keys.starred(quizId));
  else save(keys.starred(quizId), next);
  return next.includes(questionId);
}

// The accessible name stays fixed; aria-pressed carries the state.
function paintStar(button, on) {
  button.setAttribute('aria-pressed', String(on));
  button.textContent = on ? '★' : '☆';
  button.title = on ? 'הסר כוכב' : 'סמן בכוכב';
}

function starButton(question, onChange) {
  const button = el('button', 'star-toggle');
  button.type = 'button';
  button.setAttribute('aria-label', 'סימון בכוכב');
  paintStar(button, isStarred(question));
  button.addEventListener('click', () => {
    paintStar(button, flipStar(question));
    onChange?.();
  });
  return button;
}

/** A starred question for browsing: text (with a checkbox when picking), star, answer on demand. */
function starredItem(question, checkbox = null) {
  const li = el('li', 'starred-item');
  const head = el('div', 'starred-head');
  const text = el('span', null, fmt(question.question));
  if (checkbox) {
    const label = el('label', 'topic-option');
    label.append(checkbox, text);
    head.append(label);
  } else {
    head.append(text);
  }
  head.append(starButton(question, combined ? null : updateStarredButton));

  const details = el('details');
  details.append(
    el('summary', null, 'תשובה והסבר'),
    el('p', 'answer', `תשובה נכונה: ${fmt(question.options[question.correct].text)}`),
    el('p', 'muted', fmt(question.explanation)),
  );
  li.append(head, details);
  return li;
}

function currentStarredIds() {
  return starredIds(loadStars(quiz.id), quiz);
}

function updateStarredButton() {
  const count = currentStarredIds().length;
  ui.practiceStarred.disabled = count === 0;
  ui.practiceStarred.textContent = count === 0 ? 'אין שאלות מסומנות' : `תרגל ${count} שאלות מסומנות`;
}

function renderStarredBox() {
  const ids = combined ? [] : currentStarredIds();
  ui.starredBox.hidden = ids.length === 0;
  if (ids.length === 0) return;
  ui.starredList.replaceChildren(...ids.map((id) => starredItem(questionById(quiz, id))));
  updateStarredButton();
}

/** Starred questions of the combined quiz, grouped by their quiz in manifest order. */
function starredGroups() {
  const stars = new Map();
  const groups = new Map();
  for (const q of quiz.questions) {
    const { quizId, questionId, label } = q.source;
    if (!stars.has(quizId)) stars.set(quizId, new Set(loadStars(quizId)));
    if (!stars.get(quizId).has(questionId)) continue;
    if (!groups.has(quizId)) groups.set(quizId, { label, questions: [] });
    groups.get(quizId).questions.push(q);
  }
  return [...groups.values()];
}

// ---------- start screen ----------

function topicCheckboxes() {
  return [...ui.topicList.querySelectorAll('input[type="checkbox"]')];
}

function selectedQuestionIds() {
  if (combined) return [...ui.topicList.querySelectorAll('.q-check:checked')].map((c) => c.value);
  const topics = topicCheckboxes().filter((c) => c.checked).map((c) => c.value);
  return questionIdsForTopics(quiz, topics);
}

function updateStartButton() {
  const count = selectedQuestionIds().length;
  ui.startButton.disabled = count === 0;
  ui.startButton.textContent = count === 0
    ? `בחרו לפחות ${combined ? 'שאלה אחת' : 'נושא אחד'}`
    : `התחל · ${count} שאלות`;
}

function renderTopics() {
  ui.topicList.replaceChildren(...listTopics(quiz).map(({ topic, count }) => {
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

/** The combined quiz's picker: a group per quiz (checkbox for all of it), a checkbox per question. */
function renderStarPicker() {
  ui.topicList.replaceChildren(...starredGroups().map(({ label, questions }) => {
    const li = el('li', 'star-group');
    const all = el('input');
    all.type = 'checkbox';
    all.checked = true;
    const head = el('label', 'topic-option group-head');
    head.append(all, el('b', null, label), el('span', 'count', String(questions.length)));

    const boxes = questions.map((q) => {
      const box = el('input', 'q-check');
      box.type = 'checkbox';
      box.value = q.id;
      box.checked = true;
      return box;
    });
    const sync = () => {
      const n = boxes.filter((b) => b.checked).length;
      all.checked = n === boxes.length;
      all.indeterminate = n > 0 && n < boxes.length;
      updateStartButton();
    };
    all.addEventListener('change', () => {
      for (const b of boxes) b.checked = all.checked;
      sync();
    });
    for (const b of boxes) b.addEventListener('change', sync);

    const list = el('ul', 'starred-list');
    list.append(...questions.map((q, i) => starredItem(q, boxes[i])));
    li.append(head, list);
    return li;
  }));
  updateStartButton();
}

function setAllCheckboxes(checked) {
  for (const c of topicCheckboxes()) {
    c.checked = checked;
    c.indeterminate = false;
  }
  updateStartButton();
}

function renderStart() {
  phase = 'start';
  show(ui.start);
  // Stars may have changed while playing, so the picker and the starred box are rebuilt.
  if (combined) renderStarPicker();
  renderStarredBox();

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
  if (combined) begin(ids, 'starred');
  else begin(ids, ids.length === quiz.questions.length ? 'full' : 'topics');
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

function renderQuestion() {
  phase = 'question';
  show(ui.play);
  const question = currentQuestion(state, quiz);
  shownQuestion = question;
  ui.feedback.hidden = true;
  ui.skip.disabled = false;
  renderProgress();

  ui.topic.textContent = question.source ? `${question.source.label} · ${question.topic}` : question.topic;
  paintStar(ui.star, isStarred(question));
  const { attempts } = state.progress[question.id];
  ui.retryLabel.hidden = attempts === 0;
  ui.retryLabel.textContent = `חוזרת · ניסיון ${attempts + 1}`;
  ui.question.textContent = fmt(question.question);

  optionButtons = presentOptions(question).map((opt, i) => {
    const button = el('button', 'option');
    button.type = 'button';
    button.dataset.index = String(opt.index);
    button.append(el('kbd', null, String(i + 1)), el('span', null, fmt(opt.text)));
    button.addEventListener('click', () => choose(opt.index));
    return button;
  });
  ui.options.replaceChildren(...optionButtons.map((b) => {
    const li = el('li');
    li.append(b);
    return li;
  }));
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
}

function apply(result, chosenIndex) {
  state = result.state;
  persist();
  // Best score only means something for a run over the whole quiz.
  if (isComplete(state) && state.mode === 'full') {
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

function toggleShownStar() {
  if ((phase !== 'question' && phase !== 'feedback') || !shownQuestion) return;
  paintStar(ui.star, flipStar(shownQuestion));
}

function next() {
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
    const row = el('div', 'retried-row');
    row.append(details, starButton(q));
    return row;
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
    const fill = el('i');
    fill.style.inlineSize = `${Math.round(t.rate * 100)}%`;
    bar.append(fill);
    li.append(el('span', null, t.topic), bar, el('span', 'count', `${t.missed}/${t.total}`));
    return li;
  }));
  ui.noWeak.hidden = summary.weakTopics.length > 0;

  ui.retriedTitle.textContent = summary.retried.length > 0
    ? `שאלות שחזרו (${summary.retried.length})`
    : 'שאלות שחזרו';
  ui.retried.replaceChildren(...renderRetried(summary));
  ui.noRetried.hidden = summary.retried.length > 0;

  ui.retryMissed.hidden = summary.retried.length === 0;
  ui.retryMissed.textContent = `תרגל רק את ${summary.retried.length} השאלות שחזרו`;
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
  } else if (phase === 'question' && event.code === 'KeyS') {
    event.preventDefault();
    skipQuestion();
  } else if ((phase === 'question' || phase === 'feedback') && event.code === 'KeyF') {
    event.preventDefault();
    toggleShownStar();
  } else if (phase === 'feedback' && (event.key === 'Enter' || event.key === ' ')) {
    // A focused button already handles Enter/Space natively; avoid a double advance.
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return;
    event.preventDefault();
    next();
  }
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Loads every quiz that has stars, plus any a saved combined session still needs, and combines
 * them. A quiz that fails to load or validate is left out (its stars just don't show).
 */
async function loadStarredQuiz() {
  const saved = load(keys.session(STARRED_QUIZ_ID));
  const needed = new Set(combinedSessionQuizIds(saved));
  const ids = manifestQuizzes(await fetchJson('quizzes/manifest.json'))
    .map((entry) => entry.id)
    .filter((id) => isValidQuizId(id) && (needed.has(id) || loadStars(id).length > 0));

  const loaded = await Promise.allSettled(ids.map((id) => fetchJson(`quizzes/${id}.json`)));
  const quizzes = [];
  loaded.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`Could not load ${ids[i]}:`, r.reason);
    else if (validateQuiz(r.value).length > 0) console.error(`Invalid quiz file: ${ids[i]}`);
    else quizzes.push(r.value);
  });
  return combineQuizzes(quizzes);
}

async function main() {
  const params = new URLSearchParams(location.search);
  combined = params.has('starred');
  const id = params.get('id');
  if (!combined && !isValidQuizId(id)) {
    showStatus('לא נבחר בוחן.');
    return;
  }

  try {
    quiz = combined ? await loadStarredQuiz() : await fetchJson(`quizzes/${id}.json`);
  } catch (err) {
    console.error(err);
    showStatus(location.protocol === 'file:'
      ? 'יש להריץ דרך שרת (npm run serve), הדפדפן חוסם טעינה מקובץ מקומי.'
      : 'לא הצלחנו לטעון את הבוחן.');
    return;
  }

  if (combined) {
    if (starredGroups().length === 0 && !loadSavedSession()) {
      showStatus('עוד לא סימנתם שאלות. אפשר לסמן שאלה בכוכב ☆ בזמן התרגול, ולחזור לכאן כדי לתרגל רק אותן.');
      return;
    }
    document.title = 'שאלות מסומנות';
    ui.subject.textContent = 'מכל הבחנים';
    ui.title.textContent = 'שאלות מסומנות';
    ui.description.textContent = 'השאלות שסימנתם בכוכב. בחרו מאילו בחנים ואילו שאלות לתרגל.';
    ui.topicsLegend.textContent = 'שאלות לפי בוחן';
    ui.topicList.classList.add('star-picker');
  } else {
    const errors = validateQuiz(quiz);
    if (errors.length > 0) {
      console.error('Invalid quiz file:', errors);
      showStatus('קובץ הבוחן פגום. פרטים בקונסול.');
      return;
    }

    // Kicker shows the subject and, when present, the unit: "אנטומיה ופיזיולוגיה · הלב".
    const place = quiz.unit ? `${quiz.subject} · ${quiz.unit}` : quiz.subject;
    document.title = `${quiz.title} · ${place}`;
    ui.subject.textContent = place;
    ui.title.textContent = quiz.title;
    ui.description.textContent = quiz.description ?? '';
    ui.description.hidden = !quiz.description;
  }

  ui.toStart.addEventListener('click', renderStart);
  ui.resume.addEventListener('click', () => {
    state = loadSavedSession();
    if (state) renderQuestion();
    else renderStart();
  });
  ui.newSession.addEventListener('submit', onStartSubmit);
  ui.allTopics.addEventListener('click', () => setAllCheckboxes(true));
  ui.noTopics.addEventListener('click', () => setAllCheckboxes(false));
  ui.practiceStarred.addEventListener('click', () => {
    const ids = currentStarredIds();
    if (ids.length > 0) begin(ids, 'starred');
  });
  ui.star.addEventListener('click', toggleShownStar);
  ui.skip.addEventListener('click', skipQuestion);
  ui.next.addEventListener('click', next);
  ui.retryMissed.addEventListener('click', retryMissed);
  ui.newPractice.addEventListener('click', renderStart);
  document.addEventListener('keydown', onKeyDown);

  if (!combined) renderTopics();
  renderStart();
}

main();
