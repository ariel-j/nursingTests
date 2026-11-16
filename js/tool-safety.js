// tools/safety.html: factor cards, fall-risk calculator and checklist, diagnosis drill,
// restraint clock, quiz.
import {
  CHECKLIST_THRESHOLD, DIAGNOSIS_ITEMS, FALL_CHECKLIST, FALL_GROUPS, RESTRAINT_MAX_HOURS,
  SAFETY_FACTORS, SAFETY_QUIZ, atRiskByChecklist, fallBand, fallBarWidths,
  restraintClock,
} from './tool-core.js';
import { el, mountDrill, uid } from './tool-ui.js';

mountDrill(document.getElementById('dx-drill'), { items: DIAGNOSIS_ITEMS, label: 'שיוך גורם סיכון לאבחנה' });
mountDrill(document.getElementById('quiz-drill'), { items: SAFETY_QUIZ, label: 'חידון מהיר', shuffleOptions: true });

/* ---------- the nine factors: click to show an example ---------- */

document.getElementById('flips').replaceChildren(
  ...SAFETY_FACTORS.map(([title, example]) => {
    const button = el('button', 'flip');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    const detail = el('span', 'flip-detail', example);
    detail.hidden = true;
    button.append(el('b', null, title), detail);
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      detail.hidden = !open;
    });
    return button;
  }),
);

/* ---------- fall-risk calculator ---------- */

const calc = document.getElementById('calc-form');
const total = document.getElementById('calc-total');
const band = document.getElementById('calc-band');
const bars = [...document.querySelectorAll('#calc-bar i')];

for (const [key, legend, options, preset] of FALL_GROUPS) {
  const set = el('fieldset');
  set.dataset.key = key;
  set.append(el('legend', null, legend));
  const row = el('div', 'opts');
  options.forEach(([text, points], index) => {
    const label = el('label');
    const input = el('input');
    input.type = 'radio';
    input.name = key;
    input.value = String(points);
    input.id = uid(key);
    input.dataset.index = String(index);
    input.checked = index === preset;
    label.append(input, el('span', null, text));
    row.append(label);
  });
  set.append(row);
  calc.append(set);
}

function updateCalc() {
  const score = [...calc.querySelectorAll('input:checked')].reduce((sum, input) => sum + Number(input.value), 0);
  const level = fallBand(score);
  total.textContent = String(score);
  band.textContent = `דרגת סיכון ${level.label}`;
  band.className = `pill ${level.id}`;
  fallBarWidths(score).forEach((width, i) => bars[i].style.setProperty('--w', `${width}%`));
}
calc.addEventListener('change', updateCalc);
document.getElementById('calc-reset').addEventListener('click', () => {
  for (const set of calc.querySelectorAll('fieldset')) set.querySelector('input').checked = true;
  updateCalc();
});
updateCalc();

/* ---------- the 10-factor checklist ---------- */

const checklist = document.getElementById('checklist');
const verdict = document.getElementById('checklist-verdict');
checklist.append(
  ...FALL_CHECKLIST.map((text) => {
    const label = el('label');
    const input = el('input');
    input.type = 'checkbox';
    label.append(input, el('span', null, text));
    return label;
  }),
);
checklist.addEventListener('change', () => {
  const n = checklist.querySelectorAll('input:checked').length;
  const risk = atRiskByChecklist(n);
  verdict.textContent = risk
    ? `${n} גורמים: המטופל מוגדר בסיכון לנפילות.`
    : `${n} גורמים: עדיין מתחת לסף של ${CHECKLIST_THRESHOLD}.`;
  verdict.className = `drill-feedback ${risk ? 'no' : 'ok'}`;
});

/* ---------- restraint clock ---------- */

const slider = document.getElementById('hours');
const readout = document.getElementById('hours-value');
const orders = document.getElementById('clock-orders');
const assessments = document.getElementById('clock-assessments');
const visits = document.getElementById('clock-visits');
const clockNote = document.getElementById('clock-note');

const NOTES = {
  valid: ['note', 'ההוראה בתוקף. אומדן כל שעתיים וביקור צוות כל חצי שעה.'],
  renew: ['note', (h) => `בשעה ${h} פג תוקף ההוראה. מבצעים אומדן ומחדשים הוראה רק אם עדיין נדרש.`],
  approval: ['note bad', `מעל ${RESTRAINT_MAX_HOURS} שעות רצופות: נדרש אישור מנהל מחלקה (בשאלון התצפית: רופא בכיר).`],
};

function updateClock() {
  const clock = restraintClock(Number(slider.value));
  readout.textContent = String(clock.hours);
  slider.setAttribute('aria-valuetext', `${clock.hours} שעות`);
  orders.textContent = String(clock.orders);
  assessments.textContent = String(clock.assessments);
  visits.textContent = String(clock.visits);
  const [className, text] = NOTES[clock.status];
  clockNote.className = className;
  clockNote.textContent = typeof text === 'function' ? text(clock.hours) : text;
}
slider.addEventListener('input', updateClock);
updateClock();
