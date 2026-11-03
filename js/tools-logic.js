// Pure logic for the interactive parts of the nursing-intervention summaries
// (summaries/safety.html). No DOM, no storage.

// ---------- fall-risk score (חוזר 145/2019 assessment tool) ----------
// [key, label, [[option label, points], ...], index of the option checked at the start]
export const FALL_GROUPS = [
  ['fall', 'נפילה בעבר', [['לא', 0], ['כן', 1]], 1],
  ['urine', 'בעיות במתן שתן', [['אין', 0], ['הטלת שתן לילית', 1], ['דחיפות ותכיפות', 2]], 0],
  ['phys', 'מצב פיזי', [['תקין', 0], ['חולשה', 1], ['סחרחורת', 2], ['חוסר יציבות', 3]], 0],
  ['cons', 'מצב הכרה', [['תקינה', 0], ['מעורפלת', 1], ['חוסר אורינטציה, דכאון, בלבול', 2], ['חוסר תובנה למגבלות', 3]], 0],
  ['mob', 'ניידות', [['עצמאי או תלוי לחלוטין', 0], ['עזרה מועטה', 1], ['עזרה רבה', 2]], 2],
  ['age', 'גיל', [['מתחת ל‑65', 0], ['65 עד 75', 1], ['מעל 75', 2]], 2],
  ['med', 'תרופות', [['אין', 0], ['מטשטשות או מערערות שיווי משקל', 5]], 0],
];

/** Highest possible score: the best (largest) option of every group. */
export const FALL_MAX = FALL_GROUPS.reduce((sum, [, , options]) => sum + Math.max(...options.map(([, p]) => p)), 0);

export const FALL_BAND_LIMITS = { lowMax: 5, highMax: 11 };

export function fallScore(points) {
  return points.reduce((sum, p) => sum + p, 0);
}

/** Risk band for a total score: up to 5 low, 6-11 high, 12 and above very high. */
export function fallBand(score) {
  if (score <= FALL_BAND_LIMITS.lowMax) return { id: 'low', label: 'נמוכה' };
  if (score <= FALL_BAND_LIMITS.highMax) return { id: 'high', label: 'גבוהה' };
  return { id: 'vhigh', label: 'גבוהה מאוד' };
}

// ---------- 10-factor checklist ----------
export const AT_RISK_FACTORS = 3;

export function atRisk(count) {
  return count >= AT_RISK_FACTORS;
}

// ---------- physical restraint clock (חוזר רפואה 15/2009) ----------
export const ORDER_VALID_HOURS = 8;
export const ASSESSMENT_EVERY_HOURS = 2;
export const VISIT_EVERY_MINUTES = 30;
export const MANAGER_APPROVAL_AFTER_HOURS = 24;

/** What is required `hours` after a restraint began. `status`: valid | renew | over24. */
export function restraintAt(hours) {
  const h = Math.max(0, Math.floor(hours));
  let status = 'valid';
  if (h > MANAGER_APPROVAL_AFTER_HOURS) status = 'over24';
  else if (h > 0 && h % ORDER_VALID_HOURS === 0) status = 'renew';
  return {
    hours: h,
    orders: h === 0 ? 1 : Math.ceil(h / ORDER_VALID_HOURS),
    assessments: Math.floor(h / ASSESSMENT_EVERY_HOURS),
    visits: h * (60 / VISIT_EVERY_MINUTES),
    status,
  };
}
