// חזרה יומית on the concept-cards page: Leitner spaced repetition (logic in concepts-core.js). Each
// round shows up to 10 cards, due ones first: recall the answer, reveal it, then say whether you
// knew it. It covers the chosen topics (concepts-topics.js) and kind; progress is per card.
import { cardReviewStats, dailyCards, gradeReview, sanitizeReview } from './concepts-core.js';
import { dayKey } from './drugs-core.js';
import { button, el, fmt } from './drugs-ui.js';
import { keys, load, save } from './storage.js';

const $ = (id) => document.getElementById(id);

/** The label / value rows of a card's answer. */
export function answerRows(card) {
  const rows = el('dl', 'drug-rows');
  for (const { label, text } of card.rows) rows.append(el('dt', null, label), el('dd', null, fmt(text)));
  return rows;
}

/** A card's front: the term, its English name (left to right) when it has one. */
export function frontNodes(card) {
  const nodes = [card.front];
  if (card.en) {
    const en = el('span', 'concept-en', card.en);
    en.setAttribute('dir', 'ltr');
    nodes.push(' ', en);
  }
  return nodes;
}

export function initReview(topics, subjectId) {
  const key = keys.conceptReview(subjectId);
  const weightsKey = keys.conceptMatch(subjectId);
  const area = $('review-area');
  const statsLine = $('review-stats');
  const kind = $('review-kind');

  const pool = () => topics.cards(kind.value || null);
  const today = () => dayKey(new Date());
  const review = () => sanitizeReview(load(key, {}));

  function renderStats() {
    const s = cardReviewStats(pool(), review(), today());
    const doneToday = Object.values(review()).filter((e) => e.last === today()).length;
    statsLine.replaceChildren(
      el('span', null, `לחזרה היום: ${s.due}`),
      el('span', null, `בלמידה: ${s.learning}`),
      el('span', null, `נשלטו: ${s.mastered}`),
      el('span', null, `טרם נלמדו: ${s.fresh}`),
      el('span', null, `נעשו היום: ${doneToday}`),
    );
  }

  function renderStart(message) {
    renderStats();
    const set = dailyCards(pool(), review(), today(), { weights: load(weightsKey, {}) });
    const nodes = [];
    if (message) nodes.push(el('p', 'review-done', message));
    if (topics.chosen().length === 0) {
      nodes.push(el('p', 'muted', 'בחרו לפחות נושא אחד ב"נושאים".'));
    } else if (set.length === 0) {
      nodes.push(el('p', 'muted', 'אין כרגע כרטיסיות לחזרה. חזרו מחר.'));
    } else {
      const due = cardReviewStats(pool(), review(), today()).due;
      nodes.push(
        el('p', 'muted', due > 0
          ? `${Math.min(due, set.length)} כרטיסיות שהגיע זמנן לחזרה, והשאר חדשות.`
          : 'אין כרטיסיות שממתינות לחזרה. אפשר ללמוד כרטיסיות חדשות.'),
        button('primary', `התחלת סבב · ${set.length} כרטיסיות`, () => play(set)),
      );
    }
    area.replaceChildren(...nodes);
    area.querySelector('button')?.focus({ preventScroll: true });
  }

  function play(set) {
    let index = 0;
    let known = 0;
    const next = () => {
      if (index === set.length) {
        renderStart(`סיימתם סבב: ידעתם ${known} מתוך ${set.length}. כרטיסייה שלא ידעתם תחזור מחר; כרטיסייה שידעתם תחזור בעוד כמה ימים.`);
        return;
      }
      const card = set[index];
      const view = el('article', 'drug-card review-card');
      const name = el('h3', 'drug-name review-name');
      name.append(...frontNodes(card));
      view.append(
        el('p', 'review-progress', `${index + 1} מתוך ${set.length} · ${card.topicTitle}`),
        name,
        el('p', 'muted', 'מה התשובה? חשבו, ואז הציגו אותה.'),
      );
      const rows = answerRows(card);
      rows.hidden = true;
      const actions = el('div', 'actions');
      const grade = (knew) => {
        save(key, gradeReview(review(), card.id, knew, today()));
        if (knew) known += 1;
        index += 1;
        next();
      };
      const show = button('secondary', 'הצגת התשובה', () => {
        rows.hidden = false;
        actions.replaceChildren(
          button('primary', 'ידעתי', () => grade(true)),
          button('secondary', 'לא ידעתי', () => grade(false)),
        );
        actions.querySelector('button').focus();
      });
      actions.append(show);
      view.append(rows, actions);
      area.replaceChildren(view);
      show.focus();
      renderStats();
    };
    next();
  }

  topics.mount($('review-topics'));
  topics.onChange(() => renderStart());
  kind.addEventListener('change', () => renderStart());
  $('review-reset').addEventListener('click', () => {
    if (!window.confirm('למחוק את כל התקדמות החזרה היומית?')) return;
    save(key, {});
    renderStart();
  });
  return () => renderStart();
}
