// Pure maths for the pharmacodynamics summary's interactive widgets. No DOM, no storage:
// the page script (pharmacodynamics.js) draws and wires these up, the Node tests check them.

export const LOG_MIN = -9;
export const LOG_MAX = -3;

/** Dose-response presets. `emax`/`baseline` are % of the full agonist's maximum; `explain` is a lead + text. */
export const CURVES = {
  full: {
    name: 'אגוניסט מלא (Full Agonist)',
    emax: 100,
    baseline: 0,
    logEC50: -6.0,
    color: '#14b8a6',
    explain: {
      lead: 'אגוניסט מלא לבד:',
      text: 'מגיע ל-Emax מלא (100%). פוטנטיות נמדדת לפי log EC50 = -6.0. עקומה סיגמואידית סטנדרטית.',
    },
  },
  comp: {
    name: '+ אנטגוניסט תחרותי (Competitive)',
    emax: 100,
    baseline: 0,
    logEC50: -4.5,
    color: '#f59e0b',
    explain: {
      lead: 'הסטה ימינה במקביל:',
      text: 'אנטגוניסט תחרותי מתחרה על אותו האתר. ה-Emax נשאר 100% כי בעודף אגוניסט ניתן להתגבר עליו! ה-EC50 עולה (דרוש מינון גבוה יותר, הפוטנטיות יורדת לכאורה).',
    },
  },
  noncomp: {
    name: '+ אנטגוניסט לא-תחרותי (Non-competitive)',
    emax: 50,
    baseline: 0,
    logEC50: -6.0,
    color: '#f43f5e',
    explain: {
      lead: 'צניחת תקרת האפקט (Emax יורד):',
      text: 'אנטגוניסט לא-תחרותי קושר את הרצפטור באופן בלתי-הפיך או אלוסטרי. לא ניתן לגבור עליו בעודף אגוניסט. ה-EC50 לרוב נותר ללא שינוי, אך היעילות צונחת.',
    },
  },
  partial: {
    name: 'אגוניסט חלקי (Partial Agonist)',
    emax: 55,
    baseline: 0,
    logEC50: -6.0,
    color: '#06b6d4',
    explain: {
      lead: 'אפקט חלקי גם בתפוסה של 100%:',
      text: 'אגוניסט חלקי אינו מסוגל לגרום לשינוי המבני המלא של הרצפטור. ה-Emax נמוך יותר (55%). בנוכחות אגוניסט מלא הוא יתחרה איתו ויוריד את האפקט הכולל.',
    },
  },
  inverse: {
    name: 'אגוניסט הפוך (Inverse Agonist)',
    emax: -40,
    baseline: 40,
    logEC50: -6.0,
    color: '#a855f7',
    explain: {
      lead: 'הורדה מתחת לקו הבסיס:',
      text: 'כשרצפטור מציג פעילות ספונטנית בסיסית (Constitutive activity), אגוניסט הפוך מייצב את המצב הלא-פעיל ומוריד את האפקט מתחת ל-0.',
    },
  },
};

/** Response (% of the full agonist's Emax) at `logDose` on a sigmoid curve in log-dose. */
export function responseAt(logDose, curve) {
  return curve.baseline + curve.emax / (1 + 10 ** (curve.logEC50 - logDose));
}

/** Therapeutic index = TD50 / ED50. A safety measure only, not potency or efficacy. */
export function therapeuticIndex(ed50, td50) {
  return td50 / ed50;
}

/** Safety band for a TI, compared at the two decimals the page shows: 'narrow' < 2 <= 'medium' < 4.5 <= 'wide'. */
export function classifyTI(ti) {
  const shown = Math.round(ti * 100) / 100;
  if (shown < 2) return 'narrow';
  if (shown < 4.5) return 'medium';
  return 'wide';
}

/** Plasma concentration (arbitrary units) at time `t` after a gradual oral dose, or a loading (bolus) dose.
 * The bolus starts above MEC but below MTC: it targets MEC, it does not overshoot into toxicity. */
export function plasmaConcentration(t, bolus) {
  return bolus ? 0.95 * Math.exp(-0.35 * t) : 1.6 * (Math.exp(-0.3 * t) - Math.exp(-1.4 * t));
}

/** Axis top and the two therapeutic-window thresholds for the plasma curve, in the same units. */
export const PK = { timeMax: 10, concMax: 1.4, mtc: 1.05, mec: 0.42 };
