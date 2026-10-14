// חזרה יומית on the drug-cards page: Leitner spaced repetition (logic in drugs-core.js). Each round
// shows up to 10 drugs, due ones first: think of the details, reveal, then say whether you knew them.
// The learner picks which families to review (remembered); progress is per drug, whatever the pick.
import {
  dailySet, dayKey, drugId, filterDrugs, gradeReview, reviewStats, sanitizeFamilies, sanitizeReview,
} from './drugs-core.js';
import { button, drugRows, el } from './drugs-ui.js';
import { keys, load, save } from './storage.js';

const $ = (id) => document.getElementById(id);

export function initReview(deck, subjectId) {
  const key = keys.drugReview(subjectId);
  const weightsKey = keys.drugMatch(subjectId);
  const area = $('review-area');
  const statsLine = $('review-stats');
  const exam = $('review-exam');
  const familiesKey = keys.drugReviewFamilies(subjectId);
  let chosen = sanitizeFamilies(load(familiesKey, null), deck.families);

  const pool = () => filterDrugs(deck.drugs, { families: chosen, examOnly: exam.checked });
  const today = () => dayKey(new Date());
  const review = () => sanitizeReview(load(key, {}));

  function renderStats() {
    const s = reviewStats(pool(), review(), today());
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
    const set = dailySet(pool(), review(), today(), { weights: load(weightsKey, {}) });
    const nodes = [];
    if (message) nodes.push(el('p', 'review-done', message));
    if (chosen.length === 0) {
      nodes.push(el('p', 'muted', 'בחרו לפחות נושא אחד ב"נושאים לחזרה".'));
    } else if (set.length === 0) {
      nodes.push(el('p', 'muted', 'אין כרגע תרופות לחזרה. חזרו מחר.'));
    } else {
      const due = reviewStats(pool(), review(), today()).due;
      nodes.push(
        el('p', 'muted', due > 0
          ? `${Math.min(due, set.length)} תרופות שהגיע זמנן לחזרה, והשאר חדשות.`
          : 'אין תרופות שממתינות לחזרה. אפשר ללמוד תרופות חדשות.'),
        button('primary', `התחלת סבב · ${set.length} תרופות`, () => play(set)),
      );
    }
    area.replaceChildren(...nodes);
    area.querySelector('button')?.focus();
  }

  function play(set) {
    let index = 0;
    let known = 0;
    const next = () => {
      if (index === set.length) {
        renderStart(`סיימתם סבב: ידעתם ${known} מתוך ${set.length}. תרופה שלא ידעתם תחזור מחר; תרופה שידעתם תחזור בעוד כמה ימים.`);
        return;
      }
      const drug = set[index];
      const card = el('article', 'drug-card review-card');
      card.append(
        el('p', 'review-progress', `${index + 1} מתוך ${set.length} · ${drug.family}`),
        el('h3', 'drug-name review-name', drug.name),
        el('p', 'muted', 'מה המנגנון, האינדיקציות ותופעות הלוואי? חשבו, ואז הציגו את התשובה.'),
      );
      const rows = drugRows(drug);
      rows.hidden = true;
      const actions = el('div', 'actions');
      const grade = (knew) => {
        save(key, gradeReview(review(), drugId(drug), knew, today()));
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
      card.append(rows, actions);
      area.replaceChildren(card);
      show.focus();
      renderStats();
    };
    next();
  }

  // Topic picker: a checkbox per family, with its drug count (alsoIn included).
  const list = $('review-topics-list');
  const boxes = deck.families.map((f) => {
    const count = deck.drugs.filter((d) => d.family === f || d.alsoIn.includes(f)).length;
    const input = el('input');
    input.type = 'checkbox';
    input.value = f;
    const label = el('label', 'drug-check');
    label.append(input, ` ${f} (${count})`);
    list.append(label);
    return input;
  });
  const showChosen = () => {
    for (const box of boxes) box.checked = chosen.includes(box.value);
    $('review-topics-count').textContent = chosen.length === deck.families.length
      ? `כל ${deck.families.length} הנושאים`
      : `${chosen.length} מתוך ${deck.families.length}`;
  };
  const choose = (families) => {
    chosen = families;
    save(familiesKey, chosen);
    showChosen();
    renderStart();
  };
  for (const box of boxes) {
    box.addEventListener('change', () => choose(boxes.filter((b) => b.checked).map((b) => b.value)));
  }
  $('review-topics-all').addEventListener('click', () => choose([...deck.families]));
  $('review-topics-none').addEventListener('click', () => choose([]));
  showChosen();

  exam.addEventListener('change', () => renderStart());
  $('review-reset').addEventListener('click', () => {
    if (!window.confirm('למחוק את כל התקדמות החזרה היומית?')) return;
    save(key, {});
    renderStart();
  });
  return () => renderStart();
}

