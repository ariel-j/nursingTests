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
  isValidQuizId,
  listTopics,
  newAttemptId,
  presentOptions,
  progressInfo,
  questionById,
  questionIdsForTopics,
  recordResult,
  sanitizeHistory,
  skip,
  summarize,
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
  newSession: $('new-session'),
  allTopics: $('all-topics'),
  noTopics: $('no-topics'),
  topicList: $('topic-list'),
  startButton: $('start-button'),
  best: $('best'),
  stats: $('stats'),
  statsSummary: $('stats-summary'),
  statsList: $('stats-list'),
  practiceWeak: $('practice-weak'),
  practiceQuestions: $('practice-questions'),
  clearStats: $('clear-stats'),
  // play
  play: $('play'),
  trace: $('trace'),
  progressText: $('progress-text'),
  topic: $('topic'),
  retryLabel: $('retry-label'),
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

const LEVEL_LABELS = { unknown: 'אין עדיין מספיק נתונים', weak: 'דורש חיזוק', fair: 'בינוני', solid: 'שולט' };
const TREND_LABELS = { up: '↑ משתפר', down: '↓ יורד', flat: '→ יציב' };

const MODE_LABELS = { full: 'כל הבוחן', topics: 'נושאים נבחרים', retry: 'שאלות שחזרו' };

let quiz = null;
let state = null;
// 'start' → choosing; 'question' → waiting for an answer; 'feedback' → showing the result; 'done' → end screen.
let phase = 'start';
let optionButtons = [];
let lastSummary = null;
let analysis = null;

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


// ---------- statistics ----------

function loadHistory() {
  return sanitizeHistory(load(keys.history(quiz.id)));
}

function recordAttempt() {
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

// ---------- start screen ----------

function topicCheckboxes() {
  return [...ui.topicList.querySelectorAll('input[type="checkbox"]')];
}

function selectedQuestionIds() {
  const topics = topicCheckboxes().filter((c) => c.checked).map((c) => c.value);
  return questionIdsForTopics(quiz, topics);
}

function updateStartButton() {
  const count = selectedQuestionIds().length;
  ui.startButton.disabled = count === 0;
  ui.startButton.textContent = count === 0 ? 'בחרו לפחות נושא אחד' : `התחל · ${count} שאלות`;
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

function renderStart() {
  phase = 'start';
  show(ui.start);
  renderStats();

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
  ui.feedback.hidden = true;
  ui.skip.disabled = false;
  renderProgress();

  ui.topic.textContent = question.topic;
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
  if (isComplete(state)) {
    if (state.mode === 'full') {
      const summary = summarize(state, quiz);
      save(keys.results(quiz.id), recordResult(load(keys.results(quiz.id)), summary, new Date().toISOString()));
    }
    // Every finished run feeds the weak-area statistics, whatever its mode.
    recordAttempt();
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
  } else if (phase === 'feedback' && (event.key === 'Enter' || event.key === ' ')) {
    // A focused button already handles Enter/Space natively; avoid a double advance.
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return;
    event.preventDefault();
    next();
  }
}

async function main() {
  const id = new URLSearchParams(location.search).get('id');
  if (!isValidQuizId(id)) {
    showStatus('לא נבחר בוחן.');
    return;
  }

  try {
    const res = await fetch(`quizzes/${id}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    quiz = await res.json();
  } catch (err) {
    console.error(err);
    showStatus(location.protocol === 'file:'
      ? 'יש להריץ דרך שרת (npm run serve), הדפדפן חוסם טעינה מקובץ מקומי.'
      : 'לא הצלחנו לטעון את הבוחן.');
    return;
  }

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
  ui.practiceWeak.addEventListener('click', practiceWeakTopics);
  ui.practiceQuestions.addEventListener('click', practiceWeakQuestions);
  ui.clearStats.addEventListener('click', clearStats);
  ui.skip.addEventListener('click', skipQuestion);
  ui.next.addEventListener('click', next);
  ui.retryMissed.addEventListener('click', retryMissed);
  ui.newPractice.addEventListener('click', renderStart);
  document.addEventListener('keydown', onKeyDown);

  renderTopics();
  renderStart();
}

main();
