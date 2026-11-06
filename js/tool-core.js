// Pure logic and data for the interactive tools (tools/*.html). No DOM, no storage, so the Node
// tests can check it. Randomness is injected as `rng`. Content comes from the owner's own notes;
// the legal/clinical figures are the ones used by the quizzes in quizzes/.
import { shuffle } from './core.js';

/* ---------- generic drills ---------- */

/** A drill item: { prompt, options: [text, …], correct: index, why?: text }. */
export function drillItemErrors(item, where) {
  const errors = [];
  if (typeof item.prompt !== 'string' || item.prompt.trim() === '') errors.push(`${where}: empty prompt`);
  if (!Array.isArray(item.options) || item.options.length < 2 || !item.options.every((o) => typeof o === 'string' && o !== '')) {
    errors.push(`${where}: needs at least 2 text options`);
  } else {
    if (new Set(item.options).size !== item.options.length) errors.push(`${where}: duplicate options`);
    if (!Number.isInteger(item.correct) || item.correct < 0 || item.correct >= item.options.length) {
      errors.push(`${where}: "correct" is not an option index`);
    }
  }
  return errors;
}

/** Display order of a drill's options: indexes into item.options, shuffled when asked. */
export function optionOrder(item, rng = Math.random, shuffled = false) {
  const order = item.options.map((_, i) => i);
  return shuffled ? shuffle(order, rng) : order;
}

/* ---------- fall-risk calculator (חוזר 145/2019 assessment tool) ---------- */

// [key, label, [[option label, points], …], default option index]. The defaults are the worked
// example from the lecture: 80 years old, fell before, needs a lot of help moving.
export const FALL_GROUPS = [
  ['fall', 'נפילה בעבר', [['לא', 0], ['כן', 1]], 1],
  ['urine', 'בעיות במתן שתן', [['אין', 0], ['הטלת שתן לילית', 1], ['דחיפות ותכיפות', 2]], 0],
  ['phys', 'מצב פיזי', [['תקין', 0], ['חולשה', 1], ['סחרחורת', 2], ['חוסר יציבות', 3]], 0],
  ['cons', 'מצב הכרה', [['תקינה', 0], ['מעורפלת', 1], ['חוסר אורינטציה, דכאון, בלבול', 2], ['חוסר תובנה למגבלות', 3]], 0],
  ['mob', 'ניידות', [['עצמאי או תלוי לחלוטין', 0], ['עזרה מועטה', 1], ['עזרה רבה', 2]], 2],
  ['age', 'גיל', [['מתחת ל-65', 0], ['65 עד 75', 1], ['מעל 75', 2]], 2],
  ['med', 'תרופות', [['אין', 0], ['מטשטשות או מערערות שיווי משקל', 5]], 0],
];

/** The scale's printed top is 16, although the option values can add up to a little more. */
export const FALL_SCALE_MAX = 16;
export const FALL_BANDS = [
  { id: 'low', label: 'נמוכה', max: 5 },
  { id: 'high', label: 'גבוהה', max: 11 },
  { id: 'vhigh', label: 'גבוהה מאוד', max: Infinity },
];

export function fallBand(score) {
  return FALL_BANDS.find((b) => score <= b.max);
}

/** Widths (0–100) of the three bar segments for a score. */
export function fallBarWidths(score) {
  const s = Math.min(Math.max(score, 0), FALL_SCALE_MAX);
  const share = (n) => (n / FALL_SCALE_MAX) * 100;
  return [
    share(Math.min(s, 5)),
    share(Math.max(0, Math.min(s, 11) - 5)),
    share(Math.max(0, s - 11)),
  ];
}

export const CHECKLIST_THRESHOLD = 3;
export const atRiskByChecklist = (count) => count >= CHECKLIST_THRESHOLD;

/* ---------- physical restraint clock (חוזר רפואה 15/2009) ---------- */

export const RESTRAINT_ORDER_HOURS = 8;
export const RESTRAINT_ASSESS_EVERY_HOURS = 2;
export const RESTRAINT_VISITS_PER_HOUR = 2;
export const RESTRAINT_MAX_HOURS = 24;
export const RESTRAINT_SLIDER_MAX = 30;

/** What the procedure requires by `hours` since the restraint began. */
export function restraintClock(hours) {
  const h = Math.max(0, Math.floor(hours));
  let status = 'valid';
  if (h > RESTRAINT_MAX_HOURS) status = 'approval';
  else if (h > 0 && h % RESTRAINT_ORDER_HOURS === 0) status = 'renew';
  return {
    hours: h,
    orders: h === 0 ? 1 : Math.ceil(h / RESTRAINT_ORDER_HOURS),
    assessments: Math.floor(h / RESTRAINT_ASSESS_EVERY_HOURS),
    visits: h * RESTRAINT_VISITS_PER_HOUR,
    status,
  };
}

/* ---------- circulars map ---------- */

export const ALL_TOPICS = 'הכול';

/** The part of "נושא: פירוט" before the colon. */
export const topicOf = (row) => row[1].split(':')[0];

export function mapTopics(rows) {
  return [ALL_TOPICS, ...new Set(rows.map(topicOf))];
}

export function filterMap(rows, topic) {
  return topic === ALL_TOPICS ? rows : rows.filter((row) => topicOf(row) === topic);
}

/* ---------- data: circulars tool ---------- */

export const NURSING = 'פעולת סיעוד';
export const EXCEPTIONAL = 'פעולה חריגה';

export const SORTER_ITEMS = [
  ['דפיברילציה במכשיר חצי אוטומטי', 0],
  ['שאיבה עמוקה מקנה הנשימה', 1],
  ['הוצאת אבני צואה', 0],
  ['הזרקת מורפין לקטטר אפידורלי לחולים סופניים', 1],
  ['התחלת עירוי ורידי פריפרי', 0],
  ['הוצאת קו עורקי (Arterial Line)', 1],
  ['החלטה על מתן אדרנלין', 0],
  ['שחרור מטופל אחרי סדציה לפי סולם ALDRETE', 1],
  ['החלטה על הגבלה פיזית לצורך טיפול רפואי', 0],
  ['הזרקה בדחף של כימותרפיה לווריד', 1],
  ['חוקן דרך קולוסטומי בתנאים שנקבעו בחוזר', 0],
  ['התאמת מכשיר הנשמה לגמילה ממנשם', 1],
].map(([prompt, kind]) => ({
  prompt,
  options: [NURSING, EXCEPTIONAL],
  correct: kind,
  why: `לפי חוזר 234/2025 זו ${kind ? EXCEPTIONAL : NURSING}.`,
}));

/** [circular, "topic: detail"]. */
export const CIRCULARS_MAP = [
  ['145/2019', 'בטיחות: איתור מסוכנות לנפילות'],
  ['15/2009 (רפואה)', 'בטיחות: הגבלה פיזית'],
  ['249/2025', 'ניעות: ניידות מטופלים באשפוז'],
  ['163/2020', 'היגיינה: כוח עזר מיומן'],
  ['153/2019', 'שלמות הרקמה: מניעה וטיפול בפצע לחץ'],
  ['126/2017', 'שלמות הרקמה: פצעי לחץ דרגה 1-2'],
  ['166/2020', 'שלמות הרקמה: דרגות 3-4 בקהילה'],
  ['97/2013', 'מערכת השתן: הכנסת צנתר בשיקום'],
  ['102/2014', 'מערכת השתן: הוצאת צנתר בשיקום'],
  ['122/2017', 'מערכת השתן: צנתר קבוע בבית'],
  ['180/2021', 'מערכת השתן: הכנסת צנתר ביולדות'],
  ['210/2023', 'מערכת השתן: הוצאת צנתר בפנימיות'],
  ['248/2025', 'הפרשות: אי שליטה בשתן וצואה'],
  ['43/2001', 'הזנה והפרשות: זונדה ואבני צואה'],
  ['192/2022', 'הזנה: גסטרוסטום'],
  ['193/2022', 'הזנה: הפרעות בליעה'],
  ['234/2025', 'כללי: ריכוז פעולות סיעוד'],
  ['239/2025', 'כללי: ניהול טיפול תרופתי'],
  ['240/2025', 'כללי: פרוטוקולים מונחי אחיות'],
  ['24/2009 (רפואה)', 'כללי: היגיינת ידיים'],
  ['10/2010 (מנכ"ל)', 'כללי: אמצעי זהירות שגרתיים'],
  ['7/2011 (מנכ"ל)', 'כללי: התאמה תרבותית ולשונית'],
];

const ALLOWED = 'מותר';
const WITH_NURSE = 'רק בסיוע לאחות ובנוכחותה';
const FORBIDDEN = 'אסור';

export const AIDE_ITEMS = [
  ['מדידת לחץ דם במכשיר אלקטרוני', 0],
  ['בדיקת סוכר בגלוקומטר', 0],
  ['ביצוע א.ק.ג', 0],
  ['החלפת שקית צנתר שתן', 0],
  ['האכלה דרך הפה', 0],
  ['החדרת זונדה לחולה', 1],
  ['הכנסת צנתר שתן', 1],
  ['הסרת וחבישת פצע', 1],
  ['טיפול בנפטר', 1],
  ['קבלת החלטה טיפולית עצמאית על שינוי תוכנית', 2],
  ['מישוש דופק ידני כשיטת ניטור', 2],
].map(([prompt, correct]) => ({ prompt, options: [ALLOWED, WITH_NURSE, FORBIDDEN], correct }));

const q = (prompt, options, why) => ({ prompt, options, correct: 0, why });

/** Quiz items: the correct answer is written first and the options are shuffled when shown. */
export const CIRCULARS_QUIZ = [
  q('פעולת סיעוד מותרת:', ['לכל אחות בעלת רישום תקף', 'רק לאחות עם הרשאה שמית', 'רק ביחידה שאישרה אותה', 'רק למי שהסכימה מראש'], 'בכל מקום שבו נדרש הטיפול.'),
  q('על איזה חוק מבוססת פעולה חריגה?', ['פקודת הרופאים', 'תקנות בריאות העם', 'חוק זכויות החולה', 'הקוד האתי'], 'עיסוק ברפואה שהואצל.'),
  q('חוזר 163/2020 עוסק ב:', ['כוח עזר מיומן', 'נפילות', 'פצעי לחץ', 'ניידות'], 'תחומי עיסוק והכשרה.'),
  q('חוזר 210/2023 מתיר לאחות:', ['להוציא צנתר שתן במחלקות פנימיות', 'להכניס צנתר ביולדות', 'להחליף צנתר בבית', 'להכניס צנתר בשיקום'], 'הוצאת צנתר במחלקות הפנימיות.'),
  q('חוזר 193/2022:', ['התחלת הזנה בהפרעות בליעה אחרי אומדן', 'החלפת גסטרוסטום', 'הוצאת אבני צואה', 'הכנסת זונדה'], 'שיקום, נוירולוגיה וגריאטריה.'),
  q('ההכשרה של כוח עזר היא לפחות:', ['120 שעות', '60 שעות', '200 שעות', '40 שעות'], 'והיא מסתיימת תוך שנה מהקליטה.'),
  q('חוזר 234/2025 ביטל את חוזר:', ['212/2024', '188/2021', '104/2014', '43/2001'], 'עדכון הריכוז.'),
  q('חוזר 126/2017 עוסק ב:', ['פצעי לחץ דרגה 1-2', 'פצעי לחץ דרגה 3-4', 'נפילות', 'היגיינת ידיים'], '3-4 הוא חוזר 166/2020.'),
];

/* ---------- data: safety tool ---------- */

/** [factor, example]. */
export const SAFETY_FACTORS = [
  ['גיל והתפתחות', 'פעוט באמבטיה אינו מזהה סכנה'],
  ['סגנון חיים', 'הרגלים כמו עישון במיטה'],
  ['ניעות ומצב בריאותי', 'חולשת שרירים, תגובה איטית'],
  ['ליקוי בתפיסה חושית', 'ירידה בראייה או בשמיעה'],
  ['מודעות קוגניטיבית', 'בלבול: לא מבין הוראות זהירות'],
  ['יכולת לתקשר', 'קבלה והעברת מידע, למשל אחרי אירוע מוחי'],
  ['מצב רגשי', 'דכאון או אי שקט'],
  ['מודעות לבטיחות', 'לא מזהה סכנות בבית'],
  ['גורמים סביבתיים', 'בית, מקום עבודה, קהילה, שירותי בריאות'],
];

export const FALL_CHECKLIST = [
  'היסטוריה של נפילות',
  'גיל מעל 65',
  'שינויים קוגניטיביים',
  'ליקוי שמיעה או ראייה',
  'קושי בהליכה ותנועתיות',
  'שימוש באביזרי עזר',
  'אבחנות: פרקינסון, לב-ריאה, סמים, שכרות, אפילפסיה, CVA',
  'תכיפות בשתן או בפעולת מעיים',
  'חיבור לעירוי, חמצן, קטטר, זונדה',
  'גורמים תרופתיים',
];

export const RISK_DIAGNOSES = [
  'סיכון לפציעה',
  'סיכון להרעלות',
  'סיכון לחנק',
  'סיכון לטראומה',
  'תחזוקת בית לא נאותה',
];

export const DIAGNOSIS_ITEMS = [
  ['אחסון תרופות בצורה לא בטיחותית', 1],
  ['שקיות ניילון נגישות', 2],
  ['שכונת פשע ונשק בבית', 3],
  ['חוסר מודעות לסיכונים בסביבה', 0],
  ['בעיות כספיות ומערכת תמיכה לא מתאימה', 4],
  ['נזילות גז', 2],
  ['נגישות לאלכוהול וסמים', 1],
  ['שטיחים לא בטיחותיים וחוסר יציבות', 3],
].map(([prompt, correct]) => ({
  prompt,
  options: RISK_DIAGNOSES,
  correct,
  why: `האבחנה: ${RISK_DIAGNOSES[correct]}.`,
}));

export const SAFETY_QUIZ = [
  q('מי רשאי לאתר מסוכנות לנפילות לפי חוזר 145/2019?', ['האחות המוסמכת', 'כוח עזר מיומן', 'פיזיותרפיסט בלבד', 'רופא המחלקה בלבד'], 'האחות המוסמכת אחראית גם לבנות תוכנית מניעה.'),
  q('תוך כמה זמן מבצעים את אומדן הנפילות?', ['לא יאוחר מ-24 שעות', '72 שעות', 'בכל משמרת', 'רק לאחר נפילה'], 'באיסוף הנתונים הראשוני ולא יאוחר מ-24 שעות.'),
  q('ציון לתרופות מטשטשות בכלי האומדן:', ['5', '1', '2', '3'], 'הערך הגבוה ביותר בכלי.'),
  q('ציון כולל 8 בכלי האומדן הוא דרגה:', ['גבוהה', 'נמוכה', 'גבוהה מאוד', 'אין סיכון'], '6-11 גבוהה.'),
  q('כמה גורמים בצ\'קליסט מגדירים סיכון לנפילות?', ['3 או יותר', '2 או יותר', '5 או יותר', 'כולם'], '3 גורמים או יותר.'),
  q('תוקף הוראה להגבלה פיזית:', ['8 שעות', '2 שעות', '12 שעות', '24 שעות'], 'אחרי 8 שעות מעריכים ומחדשים אם נדרש.'),
  q('כל כמה זמן נעשה אומדן למטופל מוגבל?', ['כל שעתיים', 'כל חצי שעה', 'כל 4 שעות', 'כל משמרת'], 'וביקור צוות כל חצי שעה.'),
  q('שקיות ניילון נגישות וילדים באמבטיה ללא השגחה: אבחנה', ['סיכון לחנק', 'סיכון להרעלות', 'סיכון לטראומה', 'סיכון לפציעה'], 'אלה גורמי הסיכון לחנק.'),
  q('איזה מהבאים הוא אמצעי הגבלה כימי?', ['Haldol', 'חגורת חזה', 'סורגי מיטה', 'כסא גריאטרי'], 'Valium, Haldol, Mellaril.'),
  q('מדוע נפילות עולות בבתי חולים ובתי אבות?', ['שינוי סביבה', 'פחות צוות בלילה', 'יותר אביזרי עזר', 'דיווח מוגבר'], 'המטופל אינו מכיר את הסביבה.'),
];
