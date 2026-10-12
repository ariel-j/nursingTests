// Two short games on the drug-cards page (logic in drugs-core.js): סיומות (what a drug name's
// suffix says) and איזו לא שייכת (three drugs from one family, one from another).
import { buildOddOneOut, buildStemQuestion, filterDrugs, stemWords } from './drugs-core.js';
import { button, el, fmt, markAnswer } from './drugs-ui.js';

const $ = (id) => document.getElementById(id);
// A suffix like "-olol" inside Hebrew text: isolated left to right so the hyphen stays in front.
const ltr = (text) => `\u2066${text}\u2069`;

/** "נכון 7 מתוך 9 · רצף 3" kept in a status line. */
function scoreKeeper(line) {
  let right = 0;
  let total = 0;
  let streak = 0;
  return (correct) => {
    total += 1;
    if (correct) {
      right += 1;
      streak += 1;
    } else streak = 0;
    line.textContent = `נכון ${right} מתוך ${total} · רצף ${streak}`;
  };
}

/** Renders a question's option buttons; `onAnswer(chosenIndex)` runs once. */
function optionButtons(texts, onAnswer) {
  const list = el('div', 'game-options');
  const buttons = texts.map((t, i) => button('match-item', fmt(t), () => onAnswer(i, buttons)));
  list.append(...buttons);
  return list;
}

export function initStems(stems, deck) {
  const words = stemWords(stems, deck);
  const area = $('stems-area');
  const score = scoreKeeper($('stems-score'));
  const reverse = () => document.querySelector('input[name="stems-mode"]:checked').value === 'reverse';

  // Reference list: every suffix, its class and the deck's names that carry it.
  const table = el('dl', 'stems-table');
  stems.forEach((s, i) => {
    const examples = words.filter((w) => w.stem === i).map((w) => w.word).join(', ');
    table.append(el('dt', null, s.stem), el('dd', null, `${s.class} · ${examples}`));
  });
  $('stems-list').append(table);

  function ask() {
    const q = buildStemQuestion(stems, words, { reverse: reverse() });
    const stem = stems[q.stem];
    const prompt = el('p', 'game-prompt', q.prompt);
    const feedback = el('div', 'game-feedback');
    feedback.setAttribute('role', 'status');
    const options = optionButtons(q.options, (chosen, buttons) => {
      markAnswer(buttons, q.correct, chosen);
      const ok = chosen === q.correct;
      score(ok);
      const others = words.filter((w) => w.stem === q.stem && w.word !== q.word).map((w) => w.word);
      feedback.replaceChildren(
        el('p', ok ? 'is-ok' : 'is-bad', ok ? 'נכון!' : 'לא נכון.'),
        el('p', null, `${q.word}: הסיומת ${ltr(stem.stem)} = ${stem.class}.`),
        others.length > 0 ? el('p', 'muted', `עוד בקבוצה: ${others.join(', ')}`) : '',
      );
      const next = button('primary', 'הבאה', ask);
      feedback.append(next);
      next.focus();
    });
    area.replaceChildren(
      el('p', 'muted', reverse() ? 'איזו תרופה שייכת לקבוצה הזו, לפי הסיומת?' : 'לפי הסיומת, לאיזו קבוצה שייכת התרופה?'),
      prompt, options, feedback,
    );
    options.querySelector('button').focus();
  }

  for (const r of document.querySelectorAll('input[name="stems-mode"]')) r.addEventListener('change', ask);
  return ask;
}

export function initOdd(deck) {
  const area = $('odd-area');
  const exam = $('odd-exam');
  const score = scoreKeeper($('odd-score'));

  function ask() {
    const round = buildOddOneOut(filterDrugs(deck.drugs, { examOnly: exam.checked }));
    if (!round) {
      area.replaceChildren(el('p', 'muted', 'אין מספיק תרופות לבחירה הזו.'));
      return;
    }
    const feedback = el('div', 'game-feedback');
    feedback.setAttribute('role', 'status');
    const options = optionButtons(round.drugs.map((d) => d.name), (chosen, buttons) => {
      markAnswer(buttons, round.odd, chosen);
      const ok = chosen === round.odd;
      score(ok);
      // Reveal every drug's family under its name.
      buttons.forEach((b, i) => b.append(el('span', 'game-family', round.drugs[i].family)));
      const odd = round.drugs[round.odd];
      feedback.replaceChildren(
        el('p', ok ? 'is-ok' : 'is-bad', ok ? 'נכון!' : 'לא נכון.'),
        el('p', null, `שלוש מהתרופות שייכות ל${round.family}; ${odd.name} שייכת ל${odd.family}.`),
      );
      const next = button('primary', 'הבאה', ask);
      feedback.append(next);
      next.focus();
    });
    area.replaceChildren(el('p', 'game-prompt', 'איזו תרופה לא שייכת?'), options, feedback);
    options.querySelector('button').focus();
  }

  exam.addEventListener('change', ask);
  return ask;
}
