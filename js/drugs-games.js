// The question games on the drug-cards page, on the shared shell (drugs-shell.js): סיומות (what a
// drug name's suffix says), איזו לא שייכת (three drugs from one family, one from another) and בליץ
// (60 seconds of questions mixed from both and from the drug quiz). All ask about the chosen topics
// (drugs-topics.js); personal bests count only with every topic chosen. Logic in drugs-core.js.
import { buildDrugQuiz, buildOddOneOut, buildStemQuestion, stemWords } from './drugs-core.js';
import { splitBySuffix } from './drug-games-core.js';
import { createGame } from './drugs-shell.js';
import { el } from './drugs-ui.js';
import { shuffle } from './core.js';

const $ = (id) => document.getElementById(id);
// A suffix like "-olol" inside Hebrew text: isolated left to right so the hyphen stays in front.
const ltr = (text) => `⁦${text}⁩`;

/** A drug-name word with the part its suffix explains marked: Meto<mark>prolol</mark>. */
function highlighted(word, pattern) {
  const { lead, head, tail } = splitBySuffix(word, pattern);
  const span = el('span', 'stem-word');
  span.setAttribute('dir', 'ltr');
  if (lead) span.append(el('mark', 'stem-mark', lead));
  span.append(head);
  if (tail) span.append(el('mark', 'stem-mark', tail));
  return span;
}

/**
 * Suffix questions for the shell, forward (name → class) or reverse (class → name), about the names
 * of the chosen topics; null when none of them has a known suffix.
 */
function stemQuestions(stems, deck, topics) {
  const all = stemWords(stems, deck);
  const stemOf = new Map(all.map((w) => [w.word, w.stem]));
  let cache = null; // { chosen, words } of the last topic choice
  const chosenWords = () => {
    if (cache?.chosen !== topics.chosen()) cache = { chosen: topics.chosen(), words: stemWords(stems, { drugs: topics.drugs() }) };
    return cache.words;
  };
  return (reverse) => {
    const words = chosenWords();
    if (words.length === 0) return null;
    const q = buildStemQuestion(stems, words, { reverse, others: all });
    const stem = stems[q.stem];
    const prompt = el('span', reverse ? 'game-prompt-text' : 'stem-word', q.prompt);
    if (!reverse) prompt.setAttribute('dir', 'ltr');
    return {
      kicker: reverse ? 'איזו תרופה שייכת לקבוצה, לפי הסיומת?' : 'לפי הסיומת, לאיזו קבוצה שייכת התרופה?',
      prompt,
      options: q.options,
      correct: q.correct,
      reveal(buttons) {
        if (!reverse) {
          prompt.replaceWith(highlighted(q.word, stem.pattern));
          return;
        }
        // Each name option shows its own suffix.
        buttons.forEach((b, i) => {
          const word = q.options[i];
          const own = stems[stemOf.get(word)];
          if (own) b.querySelector('.option-text').replaceChildren(highlighted(word, own.pattern));
        });
      },
      explain() {
        const others = all.filter((w) => w.stem === q.stem && w.word !== q.word).map((w) => w.word);
        return [
          el('p', null, `${q.word}: הסיומת ${ltr(stem.stem)} = ${stem.class}.`),
          others.length > 0 ? el('p', 'muted', `עוד בקבוצה: ${others.join(', ')}`) : null,
        ];
      },
    };
  };
}

/**
 * An odd-one-out question for the shell: the trio from `pool`, the odd one from `pool` when it can
 * be (two or more topics), else from `outside`; null when the pool has no family of three.
 */
function oddQuestion(pool, outside) {
  const round = buildOddOneOut(pool) ?? buildOddOneOut(pool, Math.random, outside);
  if (!round) return null;
  const odd = round.drugs[round.odd];
  return {
    kicker: 'שלוש מאותה משפחה. איזו לא שייכת?',
    prompt: el('span', 'game-prompt-text', 'איזו תרופה לא שייכת?'),
    options: round.drugs.map((d) => d.name),
    correct: round.odd,
    reveal(buttons) {
      // The cards turn over to show each drug's family.
      buttons.forEach((b, i) => {
        const d = round.drugs[i];
        b.querySelector('.option-text').append(el('span', `game-family ${i === round.odd ? 'is-odd' : 'is-group'}`, d.family));
      });
    },
    explain: () => [el('p', null, `שלוש שייכות ל${round.family}; ${odd.name} שייכת ל${odd.family}.`)],
  };
}

/** A question of the generated drug quiz, as a shell question with its options reshuffled. */
function quizQuestion(questions) {
  const q = questions[Math.floor(Math.random() * questions.length)];
  const order = shuffle(q.options.map((_, i) => i));
  return {
    kicker: q.topic,
    prompt: el('span', 'game-prompt-text', q.question),
    options: order.map((i) => q.options[i].text),
    correct: order.indexOf(q.correct),
  };
}

/** The drug quiz of the chosen topics, rebuilt only when the choice changes. */
function topicQuiz(deck, topics) {
  let cache = null;
  return () => {
    if (cache?.chosen !== topics.chosen()) {
      const quiz = buildDrugQuiz(deck, { id: 'drugs-blitz', subject: '', families: topics.chosen() });
      cache = { chosen: topics.chosen(), questions: quiz.questions };
    }
    return cache.questions;
  };
}

export function initStems(stems, deck, topics, bestKey) {
  const ask = stemQuestions(stems, deck, topics);
  const reverse = () => document.querySelector('input[name="stems-mode"]:checked').value === 'reverse';

  // Reference list: every suffix, its class and the deck's names that carry it.
  const words = stemWords(stems, deck);
  const table = el('dl', 'stems-table');
  stems.forEach((s, i) => {
    const dt = el('dt', null, s.stem);
    dt.setAttribute('dir', 'ltr');
    const examples = words.filter((w) => w.stem === i).map((w) => w.word).join(', ');
    table.append(dt, el('dd', null, `${s.class} · ${examples}`));
  });
  $('stems-list').append(table);

  const start = createGame($('stems-area'), {
    gameId: 'stems',
    bestKey,
    countsBest: topics.all,
    next: () => ask(reverse()),
  });
  for (const r of document.querySelectorAll('input[name="stems-mode"]')) r.addEventListener('change', start);
  return start;
}

export function initOdd(deck, topics, bestKey) {
  const exam = $('odd-exam');
  const start = createGame($('odd-area'), {
    gameId: 'odd',
    bestKey,
    countsBest: topics.all,
    // Exam-only can leave no family of three; then the chosen topics without it.
    next: () => oddQuestion(topics.drugs({ examOnly: exam.checked }), deck.drugs)
      ?? oddQuestion(topics.drugs(), deck.drugs),
  });
  exam.addEventListener('change', start);
  return start;
}

export function initBlitz(stems, deck, topics, bestKey) {
  const ask = stems ? stemQuestions(stems, deck, topics) : null;
  const questions = topicQuiz(deck, topics);
  const fromQuiz = () => (questions().length > 0 ? quizQuestion(questions()) : null);
  const kinds = [
    ...(ask ? [() => ask(false), () => ask(true)] : []),
    () => oddQuestion(topics.drugs(), deck.drugs),
    fromQuiz,
    fromQuiz,
  ];
  return createGame($('blitz-area'), {
    gameId: 'blitz',
    title: 'בליץ: 60 שניות',
    mode: 'blitz',
    bestKey,
    countsBest: topics.all,
    intro: 'כמה שיותר תשובות נכונות בדקה אחת: סיומות, איזו לא שייכת, מנגנונים ואינדיקציות. כל תשובה נכונה ברצף שווה יותר נקודות. מקשים 1–4 עונים.',
    next: () => kinds[Math.floor(Math.random() * kinds.length)]() ?? fromQuiz(),
  });
}
