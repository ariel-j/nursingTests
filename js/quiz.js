import {
  MASTERY_STREAK,
  addAttempt,
  analyzeHistory,
  answer,
  buildAttempt,
  createSession,
  currentQuestion,
  isComplete,
  isSessionCompatible,
  isolateNumberRanges as fmt,
  listTopics,
  newAttemptId,
  presentOptions,
  progressInfo,
  questionById,
  questionIdsForTopics,
  recordResult,
  recordServed,
  sanitizeHistory,
  sampleQuestionIds,
  sessionStyle,
  skip,
  starTarget,
  starredIds,
  summarize,
  toggleStar,
} from './core.js';
import { trackEvent } from './analytics.js';
import { loadQuizFromUrl, quizPlace, subjectHomeHref } from './load-quiz.js';
import { keys, load, loadStars, prefs, remove, save } from './storage.js';

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
  starredNote: $('starred-note'),
  countSetting: $('count-setting'),
  allTopics: $('all-topics'),
  noTopics: $('no-topics'),
  count: $('count'),
  countHint: $('count-hint'),
  topicList: $('topic-list'),
  startButton: $('start-button'),
  best: $('best'),
  stats: $('stats'),
  statsSummary: $('stats-summary'),
  statsList: $('stats-list'),
  practiceWeak: $('practice-weak'),
  practiceQuestions: $('practice-questions'),
  clearStats: $('clear-stats'),
  printLink: $('print-link'),
  homeLinks: [$('home-link'), $('done-home-link')],
  // play
  play: $('play'),
  ring: $('ring'),
  ringFill: $('ring-fill'),
  ringMastered: $('ring-mastered'),
  ringTotal: $('ring-total'),
  progressText: $('progress-text'),
  topic: $('topic'),
  retryLabel: $('retry-label'),
  star: $('star'),
  question: $('question'),
  options: $('options'),
  skip: $('skip'),
  confirm: $('confirm'),
  feedback: $('feedback'),
  countdown: $('countdown'),
  autoToggle: $('auto-advance'),
  topicToggle: $('show-topic'),
  verdict: $('verdict'),
  explanation: $('explanation'),
  note: $('note'),
  requeueHint: $('requeue-hint'),
  next: $('next'),
  // done
  done: $('done'),
  scoreLabel: $('score-label'),
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

const LEVEL_LABELS = { unknown: 'אין עדיין מספיק נתונים', weak: 'דורש חיזוק', fair: 'בינוני', solid: 'שולט' };
const TREND_LABELS = { up: '↑ משתפר', down: '↓ יורד', flat: '→ יציב' };

const MODE_LABELS = { full: 'כל הבוחן', topics: 'נושאים נבחרים', retry: 'שאלות שחזרו', starred: 'שאלות מסומנות' };
const STYLE_LABELS = { practice: 'תרגול', exam: 'מבחן' };
const LETTERS = ['א', 'ב', 'ג', 'ד'];
// After a correct answer, move on by itself unless the user asked for less motion.
// The pause scales with the text the learner has to read (explanation plus note).
const AUTO_ADVANCE_MIN_MS = 2500;
const AUTO_ADVANCE_MAX_MS = 8000;
const AUTO_ADVANCE_BASE_MS = 1500;
const AUTO_ADVANCE_PER_CHAR_MS = 45;

let quiz = null;
let state = null;
// The question on screen; after answering, `state` already points at the next one.
let shownQuestion = null;
// 'start' → choosing; 'question' → waiting for an answer; 'feedback' → showing the result; 'done' → end screen.
let phase = 'start';
let optionButtons = [];
// Exam style: the option picked but not yet confirmed (authored index), or null.
let selected = null;
let lastSummary = null;
let analysis = null;
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

const isExam = () => sessionStyle(state) === 'exam';

function persist() {
  if (isComplete(state)) remove(keys.session(quiz.id));
  else save(keys.session(quiz.id), state);
}

function loadSavedSession() {
  const saved = load(keys.session(quiz.id));
  return saved && isSessionCompatible(saved, quiz) && !isComplete(saved) ? saved : null;
}


// ---------- statistics ----------

function loadHistory() {
  return sanitizeHistory(load(keys.history(quiz.id)));
}

function recordAttempt() {
  // The starred page's questions change with every star, so topic statistics would mislead there.
  if (quiz.starred) return;
  const now = new Date();
  const attempt = buildAttempt(state, quiz, { id: newAttemptId(now), date: now.toISOString() });
  // Statistics are best effort: if storage is full or blocked the quiz itself still works.
  save(keys.history(quiz.id), addAttempt(loadHistory(), attempt));
}

function renderStatRow(t) {
  const li = el('li', `stat-row level-${t.level}`);
  const bar = el('span', 'bar');
  bar.setAttribute('aria-hidden', 'true');
  const fill = el('i');
  fill.style.inlineSize = `${t.score === null ? 0 : Math.round(t.score * 100)}%`;
  bar.append(fill);

  const parts = [LEVEL_LABELS[t.level]];
  if (t.level !== 'unknown') parts.push(`${Math.round(t.score * 100)}%`);
  if (t.trend) parts.push(TREND_LABELS[t.trend]);
  const text = el('span', 'stat-text', parts.join(' · '));
  if (t.recovered) text.append(el('span', 'recovered', '✓ הייתה חלשה והתחזקה'));
  li.append(el('span', null, t.topic), bar, text);
  return li;
}

function renderStats() {
  if (quiz.starred) {
    ui.stats.hidden = true;
    return;
  }
  analysis = analyzeHistory(loadHistory(), quiz);
  ui.stats.hidden = analysis.attempts === 0;
  if (analysis.attempts === 0) return;

  const weak = analysis.topics.filter((t) => t.level === 'weak');
  ui.statsSummary.textContent = `${analysis.attempts} סבבים נשמרו · `
    + (weak.length === 0 ? 'אין כרגע נושאים שדורשים חיזוק.' : `${weak.length} נושאים דורשים חיזוק.`);
  // Weak topics first (stable sort keeps the quiz order within each group).
  const ordered = [...analysis.topics].sort((a, b) => (b.level === 'weak') - (a.level === 'weak'));
  ui.statsList.replaceChildren(...ordered.map(renderStatRow));

  const weakIds = questionIdsForTopics(quiz, weak.map((t) => t.topic));
  ui.practiceWeak.hidden = weakIds.length === 0;
  ui.practiceWeak.textContent = `תרגל את הנושאים החלשים · ${weakIds.length} שאלות`;
  ui.practiceQuestions.hidden = analysis.weakQuestions.length === 0;
  ui.practiceQuestions.textContent = `תרגל ${analysis.weakQuestions.length} שאלות שחוזרות לטעות`;
}

function practiceWeakTopics() {
  const weak = analysis.topics.filter((t) => t.level === 'weak').map((t) => t.topic);
  const ids = questionIdsForTopics(quiz, weak);
  if (ids.length > 0) begin(ids, 'topics');
}

function practiceWeakQuestions() {
  if (analysis.weakQuestions.length > 0) begin(analysis.weakQuestions.map((q) => q.id), 'retry');
}

function clearStats() {
  if (!window.confirm('הסטטיסטיקה של הבוחן הזה תימחק. להמשיך?')) return;
  remove(keys.history(quiz.id));
  renderStart();
  ui.startButton.focus({ preventScroll: true });
}

// ---------- rotation ----------

// Kept per quiz file with its own question ids (starTarget maps a mixed id back), so a quiz and the
// mixed practice that includes it rotate through the same questions.

function loadServed() {
  const files = new Map();
  const seen = {};
  for (const q of quiz.questions) {
    const { quizId, questionId } = starTarget(quiz, q.id);
    if (!files.has(quizId)) files.set(quizId, load(keys.served(quizId))?.seen ?? {});
    const entry = files.get(quizId)[questionId];
    if (entry) seen[q.id] = entry;
  }
  return { seen };
}

function saveServed(ids) {
  const now = Date.now();
  const byFile = new Map();
  for (const id of ids) {
    const { quizId, questionId } = starTarget(quiz, id);
    byFile.set(quizId, [...(byFile.get(quizId) ?? []), questionId]);
  }
  for (const [quizId, own] of byFile) save(keys.served(quizId), recordServed(load(keys.served(quizId)), own, now));
}

// ---------- stars ----------

// Generated quizzes (drug cards) are not quiz files, so there is nothing to keep a star on.
const canStar = () => !quiz.generated;

/** "Is this question starred?" over the stars as stored now, reading each quiz's list once. */
function starredNow() {
  const stars = new Map();
  return (question) => {
    const { quizId, questionId } = starTarget(quiz, question.id);
    if (!stars.has(quizId)) stars.set(quizId, new Set(loadStars(quizId)));
    return stars.get(quizId).has(questionId);
  };
}

const isStarred = (question) => starredNow()(question);

/** Flips the question's star in storage and returns whether it is now starred. */
function flipStar(question) {
  const { quizId, questionId } = starTarget(quiz, question.id);
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

/**
 * A starred question to browse: its text (with a checkbox when picking), its star, and the answer
 * on demand. Unstarring keeps the row, with an empty star, so a slip is one click to undo.
 */
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
  head.append(starButton(question, quiz.starred ? null : updateStarredButton));

  const details = el('details');
  details.append(
    el('summary', null, 'תשובה והסבר'),
    el('p', 'answer', `תשובה נכונה: ${fmt(question.options[question.correct].text)}`),
    el('p', 'muted', fmt(question.explanation)),
  );
  li.append(head, details);
  return li;
}

/** This quiz's starred questions (a mixed practice reads each quiz's own stars). */
function currentStarredIds() {
  if (!quiz.mixed) return starredIds(loadStars(quiz.id), quiz);
  return quiz.questions.filter(starredNow()).map((q) => q.id);
}

function updateStarredButton() {
  const count = currentStarredIds().length;
  ui.practiceStarred.disabled = count === 0;
  ui.practiceStarred.textContent = count === 0 ? 'אין שאלות מסומנות' : `תרגל ${count} שאלות מסומנות`;
}

function renderStarredBox() {
  const ids = quiz.starred || !canStar() ? [] : currentStarredIds();
  ui.starredBox.hidden = ids.length === 0;
  if (ids.length === 0) return;
  ui.starredList.replaceChildren(...ids.map((id) => starredItem(questionById(quiz, id))));
  updateStarredButton();
}

function practiceStarred() {
  const ids = currentStarredIds();
  if (ids.length > 0) begin(ids, 'starred');
}

// ---------- start screen ----------

// A mixed practice is chosen by unit ("group"); a single quiz by topic.
const selectionField = () => (quiz.mixed ? 'group' : 'topic');

function topicCheckboxes() {
  return [...ui.topicList.querySelectorAll('input[type="checkbox"]')];
}

function selectedTopics() {
  return topicCheckboxes().filter((c) => c.checked).map((c) => c.value);
}

// null until the learner types a number: then the count follows "everything chosen".
let wantedCount = null;

function availableCount() {
  if (quiz.starred) return ui.topicList.querySelectorAll('.q-check:checked').length;
  return questionIdsForTopics(quiz, selectedTopics(), selectionField()).length;
}

function chosenCount() {
  const max = availableCount();
  return wantedCount === null ? max : Math.min(wantedCount, max);
}

/**
 * A fresh sample of the chosen size: proportional per topic, so every chosen unit is covered, and
 * least-served first, so consecutive samples differ. `sampled` says whether it is a sample.
 */
function selectedQuestionIds() {
  if (quiz.starred) return { ids: [...ui.topicList.querySelectorAll('.q-check:checked')].map((c) => c.value), sampled: false };
  const topics = selectedTopics();
  const max = availableCount();
  if (wantedCount === null || wantedCount >= max) {
    return { ids: questionIdsForTopics(quiz, topics, selectionField()), sampled: false };
  }
  const ids = sampleQuestionIds(quiz, { topics, field: selectionField(), count: wantedCount, served: loadServed() });
  return { ids, sampled: true };
}

function chosenStyle() {
  return ui.newSession.querySelector('input[name="style"]:checked')?.value ?? 'practice';
}

function updateStartButton() {
  const max = availableCount();
  const count = chosenCount();
  ui.count.max = String(Math.max(1, max));
  ui.count.disabled = max === 0;
  if (document.activeElement !== ui.count) ui.count.value = max === 0 ? '' : String(count);
  ui.countHint.textContent = max === 0 ? '' : `מתוך ${max} זמינות`;
  ui.startButton.disabled = count === 0;
  ui.startButton.textContent = count === 0
    ? `בחרו לפחות ${quiz.starred ? 'שאלה אחת' : 'נושא אחד'}`
    : `התחל ${STYLE_LABELS[chosenStyle()]} · ${count} שאלות`;
}

/** Takes the typed number; an empty or invalid field means "all chosen questions". */
function readCount() {
  const n = Number.parseInt(ui.count.value, 10);
  wantedCount = Number.isInteger(n) && n >= 1 ? n : null;
  updateStartButton();
}

/** When the field is left, show the number that will really be used. */
function settleCount() {
  readCount();
  if (availableCount() > 0) ui.count.value = String(chosenCount());
}

/** The unit a link asked a mixed practice to start with (&group=<unit>), if it has one. */
function preselectedGroup() {
  const wanted = new URLSearchParams(location.search).get('group');
  if (!quiz.mixed || quiz.starred || wanted === null) return null;
  return quiz.questions.some((q) => q.group === wanted) ? wanted : null;
}

function renderTopics() {
  const groups = listTopics(quiz, selectionField());
  const only = preselectedGroup();
  ui.topicList.replaceChildren(...groups.map(({ topic, count }) => {
    const li = el('li');
    const label = el('label', 'topic-option');
    const box = el('input');
    box.type = 'checkbox';
    box.value = topic;
    box.checked = only === null || topic === only;
    box.addEventListener('change', updateStartButton);
    label.append(box, el('span', null, topic), el('span', 'count', String(count)));
    li.append(label);
    return li;
  }));
  updateStartButton();
}

/**
 * The starred page's picker: a group per quiz with a checkbox for all of it, and a checkbox per
 * starred question. Rebuilt on every visit to the start screen, since stars change while playing.
 */
function renderStarPicker() {
  const groups = new Map();
  const starred = starredNow();
  for (const q of quiz.questions) {
    if (!starred(q)) continue;
    if (!groups.has(q.group)) groups.set(q.group, []);
    groups.get(q.group).push(q);
  }
  ui.topicList.replaceChildren(...[...groups].map(([label, questions]) => {
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
  renderStats();
  if (quiz.starred) renderStarPicker();
  renderStarredBox();

  const saved = loadSavedSession();
  ui.resumeBox.hidden = !saved;
  if (saved) {
    const { mastered, answered, total } = progressInfo(saved);
    const label = `${STYLE_LABELS[sessionStyle(saved)]} · ${MODE_LABELS[saved.mode]}`;
    ui.resumeText.textContent = sessionStyle(saved) === 'exam'
      ? `יש סבב פתוח (${label}): נענו ${answered} מתוך ${total}.`
      : `יש סבב פתוח (${label}): נשלטו ${mastered} מתוך ${total}.`;
  }

  const results = load(keys.results(quiz.id));
  ui.best.hidden = !(results && Number.isFinite(results.bestPercent));
  if (!ui.best.hidden) {
    ui.best.textContent = `שיא בניסיון ראשון על כל הבוחן: ${results.bestPercent}% · ${results.attempts} סבבים שהושלמו`;
  }
  (saved ? ui.resume : ui.startButton).focus({ preventScroll: true });
}

/** Starts a new session; `sampled` records its questions for the rotation. */
function begin(questionIds, mode, style = 'practice', sampled = false) {
  if (loadSavedSession() && !window.confirm('הסבב הפתוח יימחק. להתחיל סבב חדש?')) return;
  state = createSession(quiz, Math.random, { questionIds, mode, style });
  if (sampled) saveServed(questionIds);
  persist();
  trackEvent(`quiz-start/${quiz.id}/${mode}`, document.title);
  renderQuestion();
}

function onStartSubmit(event) {
  event.preventDefault();
  const { ids, sampled } = selectedQuestionIds();
  if (ids.length === 0) return;
  const style = chosenStyle();
  if (quiz.starred) begin(ids, 'starred', style);
  else begin(ids, ids.length === quiz.questions.length ? 'full' : 'topics', style, sampled);
}

// ---------- play ----------

function stat(label, value) {
  const span = el('span', null, `${label}: `);
  span.append(el('strong', null, value));
  return span;
}

function renderProgress() {
  const { mastered, answered, total, queueSize } = progressInfo(state);
  if (isExam()) {
    // No first-try count here: it would give the answers away before the end.
    const fraction = total === 0 ? 0 : answered / total;
    ui.ringFill.setAttribute('stroke-dashoffset', String(100 * (1 - fraction)));
    ui.ringFill.classList.toggle('is-empty', answered === 0);
    ui.ringMastered.textContent = String(answered);
    ui.ringTotal.textContent = `מתוך ${total}`;
    ui.ring.setAttribute('aria-label', `נענו ${answered} מתוך ${total}`);
    ui.progressText.replaceChildren(stat('שאלה', `${Math.min(answered + 1, total)} מתוך ${total}`));
    return;
  }
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
  shownQuestion = question;
  const exam = isExam();
  ui.feedback.hidden = true;
  ui.skip.disabled = false;
  ui.next.disabled = true;
  // An exam has no feedback to move on from: confirm the pick instead.
  ui.next.hidden = exam;
  ui.autoToggle.closest('label').hidden = exam;
  ui.confirm.hidden = !exam;
  ui.confirm.disabled = true;
  selected = null;
  renderProgress();

  ui.topic.textContent = question.topic;
  ui.topic.hidden = !ui.topicToggle.checked;
  ui.star.hidden = !canStar();
  if (canStar()) paintStar(ui.star, isStarred(question));
  const { attempts } = state.progress[question.id];
  ui.retryLabel.hidden = exam || attempts === 0;
  ui.retryLabel.textContent = `שאלה חוזרת · ניסיון ${attempts + 1}`;
  ui.question.textContent = fmt(question.question);

  optionButtons = presentOptions(question).map((opt, i) => {
    const button = el('button', 'option');
    button.type = 'button';
    button.dataset.index = String(opt.index);
    if (exam) button.setAttribute('aria-pressed', 'false');
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
  if (isComplete(state)) {
    trackEvent(`quiz-done/${quiz.id}/${state.mode}`, document.title);
    // Best score only means something for a run over the whole of one quiz.
    if (state.mode === 'full' && !quiz.mixed) {
      const summary = summarize(state, quiz);
      save(keys.results(quiz.id), recordResult(load(keys.results(quiz.id)), summary, new Date().toISOString()));
    }
    // Every finished run feeds the weak-area statistics, whatever its mode.
    recordAttempt();
  }
  if (!isExam()) {
    showFeedback(result, chosenIndex);
  } else if (isComplete(state)) {
    renderDone();
  } else {
    // An exam shows nothing until the end: straight on to the next question.
    renderQuestion();
  }
}

function choose(optionIndex) {
  if (phase !== 'question') return;
  if (!isExam()) {
    apply(answer(state, quiz, optionIndex), optionIndex);
    return;
  }
  selected = optionIndex;
  for (const button of optionButtons) {
    const on = Number(button.dataset.index) === optionIndex;
    button.classList.toggle('is-selected', on);
    button.setAttribute('aria-pressed', String(on));
  }
  ui.confirm.disabled = false;
}

function confirmChoice() {
  if (phase !== 'question' || !isExam() || selected === null) return;
  apply(answer(state, quiz, selected), selected);
}

function skipQuestion() {
  if (phase !== 'question') return;
  apply(skip(state, quiz), null);
}

function toggleShownStar() {
  if ((phase !== 'question' && phase !== 'feedback') || !shownQuestion || !canStar()) return;
  paintStar(ui.star, flipStar(shownQuestion));
}

function next() {
  cancelAutoAdvance();
  if (phase !== 'feedback') return;
  if (isComplete(state)) renderDone();
  else renderQuestion();
}

// ---------- end screen ----------

function renderRetried(summary, exam) {
  return summary.retried.map((r) => {
    const q = questionById(quiz, r.id);
    const details = el('details', 'retried-item');
    const head = el('summary');
    let label = r.misses === 1 ? 'טעות אחת' : `${r.misses} טעויות`;
    if (exam) label = r.choice === null ? 'דילוג' : 'טעות';
    head.append(el('b', null, label), document.createTextNode(` · ${fmt(q.question)}`));
    details.append(head);
    if (exam && r.choice !== null) {
      details.append(el('p', 'your-answer', `התשובה שלך: ${fmt(q.options[r.choice].text)}`));
      const note = q.options[r.choice].note ?? '';
      if (note.trim() !== '') details.append(el('p', 'note', fmt(note)));
    }
    details.append(
      el('p', 'answer', `תשובה נכונה: ${fmt(q.options[q.correct].text)}`),
      el('p', 'muted', fmt(q.explanation)),
    );
    if (!canStar()) return details;
    const row = el('div', 'retried-row');
    row.append(details, starButton(q));
    return row;
  });
}

function renderDone() {
  phase = 'done';
  show(ui.done);
  const exam = isExam();
  const summary = summarize(state, quiz);
  lastSummary = summary;

  ui.scoreLabel.textContent = exam ? 'ציון במבחן' : 'ציון בניסיון ראשון';
  ui.scorePercent.textContent = `${summary.firstTryPercent}%`;
  ui.score.textContent = exam
    ? `${summary.firstTryCorrect} מתוך ${summary.total} תשובות נכונות.`
    : `${summary.firstTryCorrect} מתוך ${summary.total} שאלות נענו נכון בפעם הראשונה.`;

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

  const heading = exam ? 'שאלות שטעית בהן' : 'שאלות שחזרו';
  ui.retriedTitle.textContent = summary.retried.length > 0 ? `${heading} (${summary.retried.length})` : heading;
  ui.retried.replaceChildren(...renderRetried(summary, exam));
  ui.noRetried.textContent = exam ? 'כל התשובות נכונות!' : 'כל השאלות נענו נכון בפעם הראשונה.';
  ui.noRetried.hidden = summary.retried.length > 0;

  ui.retryMissed.hidden = summary.retried.length === 0;
  (ui.retryMissed.hidden ? ui.newPractice : ui.retryMissed).focus({ preventScroll: true });
}

function retryMissed() {
  if (!lastSummary || lastSummary.retried.length === 0) return;
  // Going over mistakes is practice, whatever the style of the run that produced them.
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
  } else if (phase === 'question' && event.key === 'Enter' && isExam()) {
    // A focused button handles Enter itself (an option picks, confirm confirms); confirm from
    // anywhere else, or from the option that is already picked.
    const target = event.target;
    if (target instanceof HTMLButtonElement && !target.classList.contains('is-selected')) return;
    if (target instanceof HTMLInputElement || target instanceof HTMLAnchorElement) return;
    event.preventDefault();
    confirmChoice();
  } else if ((phase === 'question' || phase === 'feedback') && event.code === 'KeyA' && !isExam()) {
    event.preventDefault();
    ui.autoToggle.click();
  } else if ((phase === 'question' || phase === 'feedback') && event.code === 'KeyT') {
    event.preventDefault();
    ui.topicToggle.click();
  } else if (phase === 'question' && event.code === 'KeyS') {
    event.preventDefault();
    skipQuestion();
  } else if ((phase === 'question' || phase === 'feedback') && event.code === 'KeyF' && canStar()) {
    event.preventDefault();
    toggleShownStar();
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

  if (quiz.starred && !quiz.questions.some(starredNow()) && !loadSavedSession()) {
    showStatus('עוד לא סימנתם שאלות. אפשר לסמן שאלה בכוכב ☆ בזמן התרגול, ולחזור לכאן כדי לתרגל רק אותן.');
    return;
  }

  // Kicker shows the subject and, when present, the unit: "אנטומיה ופיזיולוגיה · הלב".
  // Opened from a unit's "מבחן סיכום אישי" card (&group=<unit>): name it after that unit.
  const group = preselectedGroup();
  const place = quiz.starred ? 'מכל הבחנים' : `${quizPlace(quiz)}${group ? ` · ${group}` : ''}`;
  const title = group ? 'מבחן סיכום אישי' : quiz.title;
  document.title = `${title} · ${place}`;
  ui.subject.textContent = place;
  ui.title.textContent = title;
  // Same ?id= or ?subject= as this page, so mixed practice prints mixed too.
  ui.printLink.href = `print.html${location.search}`;
  subjectHomeHref(quiz).then((href) => {
    for (const link of ui.homeLinks) link.href = href;
  });
  ui.description.textContent = quiz.description ?? '';
  ui.description.hidden = !quiz.description;
  if (quiz.starred) {
    // Questions are picked one by one here, so no topic count field and no printable exam.
    ui.topicsLegend.textContent = 'שאלות לפי בוחן';
    ui.topicList.classList.add('star-picker');
    ui.countSetting.hidden = true;
    ui.printLink.hidden = true;
    ui.starredNote.hidden = false;
  }

  ui.toStart.addEventListener('click', renderStart);
  ui.resume.addEventListener('click', () => {
    state = loadSavedSession();
    if (state) renderQuestion();
    else renderStart();
  });
  ui.newSession.addEventListener('submit', onStartSubmit);
  ui.allTopics.addEventListener('click', () => setAllCheckboxes(true));
  ui.count.addEventListener('input', readCount);
  ui.count.addEventListener('change', settleCount);
  ui.noTopics.addEventListener('click', () => setAllCheckboxes(false));
  ui.practiceStarred.addEventListener('click', practiceStarred);
  ui.star.addEventListener('click', toggleShownStar);
  ui.practiceWeak.addEventListener('click', practiceWeakTopics);
  ui.practiceQuestions.addEventListener('click', practiceWeakQuestions);
  ui.clearStats.addEventListener('click', clearStats);
  ui.topicToggle.checked = load(prefs.showTopic) === true;
  ui.topicToggle.addEventListener('change', () => {
    save(prefs.showTopic, ui.topicToggle.checked);
    ui.topic.hidden = !ui.topicToggle.checked;
  });
  ui.autoToggle.checked = autoAdvanceOn();
  ui.autoToggle.addEventListener('change', () => {
    save(prefs.autoAdvance, ui.autoToggle.checked);
    if (ui.autoToggle.checked) startAutoAdvance();
    else cancelAutoAdvance();
  });
  ui.skip.addEventListener('click', skipQuestion);
  ui.confirm.addEventListener('click', confirmChoice);
  ui.newSession.addEventListener('change', (event) => {
    if (event.target.name === 'style') updateStartButton();
  });
  ui.next.addEventListener('click', next);
  // Touching the explanation means the learner is still reading: stop the automatic advance.
  ui.feedback.addEventListener('pointerdown', cancelAutoAdvance);
  ui.retryMissed.addEventListener('click', retryMissed);
  ui.newPractice.addEventListener('click', renderStart);
  document.addEventListener('keydown', onKeyDown);

  if (!quiz.starred) renderTopics();
  renderStart();
}

main();
