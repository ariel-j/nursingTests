import {
  MASTERY_STREAK,
  answer,
  createSession,
  currentQuestion,
  isComplete,
  isSessionCompatible,
  isValidQuizId,
  presentOptions,
  progressInfo,
  recordResult,
  skip,
  summarize,
  validateQuiz,
} from './core.js';
import { keys, load, remove, save } from './storage.js';

const $ = (id) => document.getElementById(id);
const ui = {
  title: $('quiz-title'),
  status: $('status'),
  restart: $('restart'),
  play: $('play'),
  progressText: $('progress-text'),
  progressFill: $('progress-fill'),
  topic: $('topic'),
  question: $('question'),
  options: $('options'),
  skip: $('skip'),
  feedback: $('feedback'),
  verdict: $('verdict'),
  explanation: $('explanation'),
  note: $('note'),
  requeueHint: $('requeue-hint'),
  next: $('next'),
  done: $('done'),
  score: $('score'),
  weakTopics: $('weak-topics'),
  noWeak: $('no-weak'),
  retried: $('retried'),
  noRetried: $('no-retried'),
  again: $('again'),
};

let quiz = null;
let state = null;
// 'question' → waiting for an answer; 'feedback' → showing the result; 'done' → end screen.
let phase = 'question';
let optionButtons = [];

function showStatus(text) {
  ui.status.textContent = text;
  ui.status.hidden = false;
  ui.play.hidden = true;
  ui.done.hidden = true;
}

function persist() {
  if (isComplete(state)) {
    remove(keys.session(quiz.id));
  } else {
    save(keys.session(quiz.id), state);
  }
}

function renderProgress() {
  const { mastered, total, queueSize } = progressInfo(state);
  ui.progressText.textContent = `נשלטו ${mastered} מתוך ${total} · בתור: ${queueSize}`;
  ui.progressFill.style.inlineSize = `${total === 0 ? 0 : (100 * mastered) / total}%`;
}

function renderQuestion() {
  phase = 'question';
  const question = currentQuestion(state, quiz);
  ui.status.hidden = true;
  ui.done.hidden = true;
  ui.play.hidden = false;
  ui.feedback.hidden = true;
  ui.skip.disabled = false;
  renderProgress();

  ui.topic.textContent = question.topic;
  ui.question.textContent = question.question;

  optionButtons = presentOptions(question).map((opt, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option';
    button.dataset.index = String(opt.index);
    const key = document.createElement('kbd');
    key.textContent = String(i + 1);
    const text = document.createElement('span');
    text.textContent = opt.text;
    button.append(key, text);
    button.addEventListener('click', () => choose(opt.index));
    return button;
  });
  ui.options.replaceChildren(...optionButtons.map((b) => {
    const li = document.createElement('li');
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
  }
  ui.skip.disabled = true;

  if (chosenIndex === null) ui.verdict.textContent = 'דילגת. התשובה הנכונה מסומנת.';
  else ui.verdict.textContent = correct ? 'נכון!' : 'לא נכון.';
  ui.verdict.className = `verdict ${correct ? 'good' : 'bad'}`;
  ui.explanation.textContent = question.explanation;

  const note = chosenIndex === null ? '' : question.options[chosenIndex].note ?? '';
  ui.note.hidden = note.trim() === '';
  ui.note.textContent = correct ? note : `על התשובה שבחרת: ${note}`;

  let hint = '';
  if (!progress.mastered) {
    const remaining = MASTERY_STREAK - progress.streak;
    hint = remaining === 1
      ? 'השאלה תחזור בהמשך — עוד תשובה נכונה אחת והיא נשלטת.'
      : `השאלה תחזור בהמשך — צריך ${remaining} תשובות נכונות ברצף.`;
  }
  ui.requeueHint.textContent = hint;
  ui.requeueHint.hidden = hint === '';

  ui.feedback.hidden = false;
  renderProgress();
  ui.next.focus();
}

function apply(result, chosenIndex) {
  state = result.state;
  persist();
  if (isComplete(state)) {
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
  if (phase !== 'feedback') return;
  if (isComplete(state)) renderDone();
  else renderQuestion();
}

function renderDone() {
  phase = 'done';
  const summary = summarize(state, quiz);
  ui.play.hidden = true;
  ui.done.hidden = false;

  ui.score.textContent =
    `נכון בניסיון ראשון: ${summary.firstTryCorrect} מתוך ${summary.total} (${summary.firstTryPercent}%)`;

  ui.weakTopics.replaceChildren(...summary.weakTopics.map((t) => {
    const li = document.createElement('li');
    li.textContent = `${t.topic} — ${t.missed} מתוך ${t.total} שאלות חזרו`;
    return li;
  }));
  ui.noWeak.hidden = summary.weakTopics.length > 0;

  ui.retried.replaceChildren(...summary.retried.map((r) => {
    const li = document.createElement('li');
    const q = document.createElement('span');
    q.textContent = r.question;
    const meta = document.createElement('span');
    meta.className = 'muted';
    meta.textContent = ` (${r.topic} · ${r.misses === 1 ? 'טעות אחת' : `${r.misses} טעויות`})`;
    li.append(q, meta);
    return li;
  }));
  ui.noRetried.hidden = summary.retried.length > 0;
  ui.again.focus();
}

function startFresh() {
  state = createSession(quiz);
  persist();
  renderQuestion();
}

function restart() {
  if (phase !== 'done' && !window.confirm('להתחיל את הבוחן מחדש? ההתקדמות הנוכחית תימחק.')) return;
  startFresh();
}

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
      ? 'יש להריץ דרך שרת (npm run serve) — הדפדפן חוסם טעינה מקובץ מקומי.'
      : 'לא הצלחנו לטעון את הבוחן.');
    return;
  }

  const errors = validateQuiz(quiz);
  if (errors.length > 0) {
    console.error('Invalid quiz file:', errors);
    showStatus('קובץ הבוחן פגום. פרטים בקונסול.');
    return;
  }

  document.title = quiz.title;
  ui.title.textContent = quiz.title;
  ui.restart.hidden = false;

  ui.skip.addEventListener('click', skipQuestion);
  ui.next.addEventListener('click', next);
  ui.again.addEventListener('click', startFresh);
  ui.restart.addEventListener('click', restart);
  document.addEventListener('keydown', onKeyDown);

  const saved = load(keys.session(quiz.id));
  if (saved && isSessionCompatible(saved, quiz) && !isComplete(saved)) {
    state = saved;
    renderQuestion();
  } else {
    startFresh();
  }
}

main();
