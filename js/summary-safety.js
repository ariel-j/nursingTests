// Interactive parts of summaries/safety.html: example reveal, fall-risk calculator and checklist,
// diagnosis matcher, restraint clock and the quick quiz. The summary text itself is static HTML.
import {
  FALL_GROUPS, FALL_MAX, ORDER_VALID_HOURS, atRisk, fallBand, fallScore, restraintAt,
} from './tools-logic.js';
import { el, mountDrill } from './widgets.js';

const widget = (name) => document.querySelector(`[data-widget="${name}"]`);

// ---------- practice mode for the nine factors ----------
// Examples are hidden; each factor reveals its example on click (Enter / Space).
const factors = document.getElementById('factors');
const practiceBtn = widget('practice');
if (factors && practiceBtn) {
  const rows = [...factors.querySelectorAll('dl.def')];
  const toggle = (row, open) => {
    row.classList.toggle('is-open', open);
    row.querySelector('dt').setAttribute('aria-expanded', String(open));
  };
  for (const row of rows) {
    const term = row.querySelector('dt');
    term.addEventListener('click', () => {
      if (factors.classList.contains('practice')) toggle(row, !row.classList.contains('is-open'));
    });
    term.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && factors.classList.contains('practice')) {
        e.preventDefault();
        term.click();
      }
    });
  }
  practiceBtn.addEventListener('click', () => {
    const on = factors.classList.toggle('practice');
    practiceBtn.setAttribute('aria-pressed', String(on));
    practiceBtn.textContent = on ? 'הצגת כל הדוגמאות' : 'מצב תרגול: הסתרת הדוגמאות';
    for (const row of rows) {
      const term = row.querySelector('dt');
      row.classList.remove('is-open');
      if (on) {
        term.tabIndex = 0;
        term.setAttribute('role', 'button');
        term.setAttribute('aria-expanded', 'false');
      } else {
        term.removeAttribute('tabindex');
        term.removeAttribute('role');
        term.removeAttribute('aria-expanded');
      }
    }
  });
}

// ---------- fall-risk calculator ----------
const calcRoot = widget('calc');
if (calcRoot) {
  const form = el('form', 'calc');
  form.addEventListener('submit', (e) => e.preventDefault());
  for (const [key, label, options, start] of FALL_GROUPS) {
    const set = el('fieldset', 'chips');
    set.append(el('legend', null, label));
    options.forEach(([text, points], i) => {
      const lab = el('label');
      const input = el('input');
      input.type = 'radio';
      input.name = key;
      input.value = String(points);
      input.checked = i === start;
      lab.append(input, el('span', null, text));
      set.append(lab);
    });
    form.append(set);
  }
  const total = el('strong', 'calc-total en');
  const pill = el('span', 'pill');
  const fill = el('i');
  const bar = el('div', 'meter');
  bar.setAttribute('aria-hidden', 'true');
  bar.append(fill);
  const result = el('div', 'calc-result');
  result.setAttribute('role', 'status');
  result.append(total, pill);

  const update = () => {
    const points = FALL_GROUPS.map(([key]) => Number(form.elements[key].value));
    const score = fallScore(points);
    const band = fallBand(score);
    total.textContent = `${score} / ${FALL_MAX}`;
    pill.textContent = `דרגת סיכון ${band.label}`;
    pill.className = `pill ${band.id}`;
    fill.className = band.id;
    fill.style.inlineSize = `${Math.min(score, FALL_MAX) / FALL_MAX * 100}%`;
  };
  form.addEventListener('change', update);
  calcRoot.replaceChildren(form, result, bar);
  update();
}

// ---------- 10-factor checklist ----------
const checkRoot = widget('checklist');
if (checkRoot) {
  const FACTORS = [
    'היסטוריה של נפילות', 'גיל מעל 65', 'שינויים קוגניטיביים', 'ליקוי שמיעה או ראייה',
    'קושי בהליכה ותנועתיות', 'שימוש באביזרי עזר',
    'אבחנות: פרקינסון, לב-ריאה, סמים, שכרות, אפילפסיה, CVA', 'תכיפות בשתן או בפעולת מעיים',
    'חיבור לעירוי, חמצן, קטטר, זונדה', 'גורמים תרופתיים',
  ];
  const set = el('fieldset', 'chips');
  set.append(el('legend', null, 'סמנו כמה גורמים מתקיימים אצל המטופל'));
  const feedback = el('p', 'drill-feedback');
  feedback.setAttribute('role', 'status');
  for (const text of FACTORS) {
    const lab = el('label');
    const input = el('input');
    input.type = 'checkbox';
    lab.append(input, el('span', null, text));
    set.append(lab);
  }
  set.addEventListener('change', () => {
    const n = set.querySelectorAll('input:checked').length;
    const risk = atRisk(n);
    feedback.textContent = risk
      ? `${n} גורמים: המטופל מוגדר בסיכון לנפילות.`
      : `${n} גורמים: עדיין מתחת לסף של 3.`;
    feedback.className = `drill-feedback ${risk ? 'no' : 'ok'}`;
  });
  checkRoot.replaceChildren(set, feedback);
}

// ---------- diagnosis matcher ----------
const DIAGNOSES = ['סיכון לפציעה', 'סיכון להרעלות', 'סיכון לחנק', 'סיכון לטראומה', 'תחזוקת בית לא נאותה'];
const FACTOR_TO_DIAGNOSIS = [
  ['אחסון תרופות בצורה לא בטיחותית', 1], ['שקיות ניילון נגישות', 2],
  ['שכונת פשע ונשק בבית', 3], ['חוסר מודעות לסיכונים בסביבה', 0],
  ['בעיות כספיות ומערכת תמיכה לא מתאימה', 4], ['נזילות גז', 2],
  ['נגישות לאלכוהול וסמים', 1], ['שטיחים לא בטיחותיים וחוסר יציבות', 3],
];
const dxRoot = widget('dx');
if (dxRoot) {
  mountDrill(dxRoot, {
    items: FACTOR_TO_DIAGNOSIS.map(([prompt, answer]) => ({ prompt, options: DIAGNOSES, answer })),
  });
}

// ---------- restraint clock ----------
const clockRoot = widget('restraint');
if (clockRoot) {
  const slider = el('input');
  slider.type = 'range';
  slider.id = 'restraint-hours';
  slider.min = '0';
  slider.max = '30';
  slider.step = '1';
  slider.value = '9';
  const label = el('label', 'clock-label');
  label.htmlFor = slider.id;
  const hoursText = el('span');
  label.append('שעות מתחילת ההגבלה: ', hoursText);

  const stat = (caption) => {
    const box = el('div', 'stat');
    const value = el('strong');
    box.append(value, el('small', null, caption));
    return [box, value];
  };
  const [ordersBox, orders] = stat(`הוראות שניתנו (תוקף כל אחת ${ORDER_VALID_HOURS} שעות)`);
  const [assessBox, assessments] = stat('אומדנים שעברו (כל שעתיים)');
  const [visitsBox, visits] = stat('ביקורי צוות (כל חצי שעה)');
  const stats = el('div', 'stats');
  stats.append(ordersBox, assessBox, visitsBox);
  const note = el('p', 'note');
  note.setAttribute('role', 'status');

  const NOTES = {
    over24: 'מעל 24 שעות רצופות: נדרש אישור מנהל מחלקה (בשאלון התצפית: רופא בכיר).',
    valid: 'ההוראה בתוקף. אומדן כל שעתיים וביקור צוות כל חצי שעה.',
  };
  const update = () => {
    const r = restraintAt(Number(slider.value));
    hoursText.textContent = String(r.hours);
    orders.textContent = String(r.orders);
    assessments.textContent = String(r.assessments);
    visits.textContent = String(r.visits);
    note.textContent = r.status === 'renew'
      ? `בשעה ${r.hours} פג תוקף ההוראה. מבצעים אומדן ומחדשים הוראה רק אם עדיין נדרש.`
      : NOTES[r.status];
    note.className = r.status === 'over24' ? 'note bad' : 'note';
  };
  slider.addEventListener('input', update);
  clockRoot.replaceChildren(label, slider, stats, note);
  update();
}

// ---------- quick quiz ----------
// Correct answer first; the drill reshuffles the options on every display.
const QUIZ = [
  ['מי רשאי לאתר מסוכנות לנפילות לפי חוזר 145/2019?', ['האחות המוסמכת', 'כוח עזר מיומן', 'פיזיותרפיסט בלבד', 'רופא המחלקה בלבד'], 'האחות המוסמכת אחראית גם לבנות תוכנית מניעה.'],
  ['תוך כמה זמן מבצעים את אומדן הנפילות?', ['לא יאוחר מ-24 שעות', '72 שעות', 'בכל משמרת', 'רק לאחר נפילה'], 'באיסוף הנתונים הראשוני ולא יאוחר מ-24 שעות.'],
  ['ציון לתרופות מטשטשות בכלי האומדן:', ['5', '1', '2', '3'], 'הערך הגבוה ביותר בכלי.'],
  ['ציון כולל 8 בכלי האומדן הוא דרגה:', ['גבוהה', 'נמוכה', 'גבוהה מאוד', 'אין סיכון'], '6-11 גבוהה.'],
  ['כמה גורמים בצ\'קליסט מגדירים סיכון לנפילות?', ['3 או יותר', '2 או יותר', '5 או יותר', 'כולם'], '3 גורמים או יותר.'],
  ['תוקף הוראה להגבלה פיזית:', ['8 שעות', '2 שעות', '12 שעות', '24 שעות'], 'אחרי 8 שעות מעריכים ומחדשים אם נדרש.'],
  ['כל כמה זמן נעשה אומדן למטופל מוגבל?', ['כל שעתיים', 'כל חצי שעה', 'כל 4 שעות', 'כל משמרת'], 'וביקור צוות כל חצי שעה.'],
  ['שקיות ניילון נגישות וילדים באמבטיה ללא השגחה: אבחנה', ['סיכון לחנק', 'סיכון להרעלות', 'סיכון לטראומה', 'סיכון לפציעה'], 'אלה גורמי הסיכון לחנק.'],
  ['איזה מהבאים הוא אמצעי הגבלה כימי?', ['Haldol', 'חגורת חזה', 'סורגי מיטה', 'כסא גריאטרי'], 'Valium, Haldol, Mellaril.'],
  ['מדוע נפילות עולות בבתי חולים ובתי אבות?', ['שינוי סביבה', 'פחות צוות בלילה', 'יותר אביזרי עזר', 'דיווח מוגבר'], 'המטופל אינו מכיר את הסביבה.'],
];
const quizRoot = widget('quiz');
if (quizRoot) {
  mountDrill(quizRoot, {
    shuffleOptions: true,
    items: QUIZ.map(([prompt, options, note]) => ({ prompt, options, answer: 0, note })),
  });
}
