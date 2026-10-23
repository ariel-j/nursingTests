// The short summaries, in the order the hub and the combined print show them. Each id is a page
// summaries/<id>.html whose <article class="summary" data-system="<id>"> holds the content.
// No DOM here, so the Node tests can check it against the files.

export const SUMMARIES = [
  {
    id: 'cardiovascular',
    title: 'המערכת הקרדיווסקולרית',
    blurb: 'הלב כמשאבה, הולכה חשמלית ו‑ECG, מחזור הלב, תפוקת הלב ולחץ הדם.',
  },
  {
    id: 'excretory',
    title: 'מערכת ההפרשה (הכליה)',
    blurb: 'הנפרון, סינון, ספיגה חוזרת והפרשה, ADH ו‑RAAS, מאזן חומצה–בסיס.',
  },
  {
    id: 'endocrine',
    title: 'המערכת האנדוקרינית',
    blurb: 'סוגי הורמונים, ציר היפותלמוס–היפופיזה, תריס, אדרנל, לבלב ואצטרובל.',
  },
  {
    id: 'digestive',
    title: 'מערכת העיכול',
    blurb: 'הפה והקיבה, לבלב, כבד ומרה, ספיגה, המעי הגס ובקרה עצבית.',
  },
  {
    id: 'hygiene',
    title: 'היגיינה ואומדן העור',
    blurb: 'מבנה העור, ממצאי עור, מודל רמת התפקוד, טיפול בפה ובחושים ורחצה. עם כרטיסיות וחידון.',
  },
  {
    id: 'tissue-integrity',
    title: 'שלמות הרקמה',
    blurb: 'פצעים אקוטיים וכרוניים, שלבי ריפוי, פצעי לחץ, נורטון וברדן וחוזר 153. עם כרטיסיות וחידון.',
  },
  {
    id: 'mobility',
    title: 'ניעות',
    blurb: 'חוזר 249/2025, השפעת שכיבה לפי מערכות, סיבוכים, תנוחות, ארגונומיה ו‑Deconditioning. עם כרטיסיות וחידון.',
  },
  {
    id: 'sleep',
    title: 'מנוחה ושינה',
    blurb: 'שלבי NREM ו‑REM, מלטונין ומקצב צירקדי, הפרעות שינה, דום נשימה והיגיינת שינה. עם כרטיסיות וחידון.',
  },
];

/** Page file for a summary, relative to the summaries/ folder. */
export const summaryFile = (id) => `${id}.html`;
