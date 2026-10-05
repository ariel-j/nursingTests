// The short summaries, in the order the hub and the combined print show them. Each id is a page
// summaries/<id>.html whose <article class="summary" data-system="<id>"> holds the content, and
// `subject` is the id of its subject in quizzes/subjects.json.
// No DOM here, so the Node tests can check it against the files.

export const SUMMARIES = [
  {
    subject: 'anatomy',
    id: 'cardiovascular',
    title: 'המערכת הקרדיווסקולרית',
    blurb: 'הלב כמשאבה, הולכה חשמלית ו‑ECG, מחזור הלב, תפוקת הלב ולחץ הדם.',
  },
  {
    subject: 'anatomy',
    id: 'excretory',
    title: 'מערכת ההפרשה (הכליה)',
    blurb: 'הנפרון, סינון, ספיגה חוזרת והפרשה, ADH ו‑RAAS, מאזן חומצה–בסיס.',
  },
  {
    subject: 'anatomy',
    id: 'endocrine',
    title: 'המערכת האנדוקרינית',
    blurb: 'סוגי הורמונים, ציר היפותלמוס–היפופיזה, תריס, אדרנל, לבלב ואצטרובל.',
  },
  {
    subject: 'anatomy',
    id: 'digestive',
    title: 'מערכת העיכול',
    blurb: 'הפה והקיבה, לבלב, כבד ומרה, ספיגה, המעי הגס ובקרה עצבית.',
  },
  {
    subject: 'pharmacology',
    id: 'pharmacokinetics',
    title: 'פרמקוקינטיקה',
    blurb: 'ADME: ספיגה וזמינות ביולוגית, פיזור ו‑Vd, CYP450 וקינטיקה, פינוי ומינון.',
  },
  {
    subject: 'pharmacology',
    id: 'pharmacodynamics',
    title: 'פרמקודינמיקה',
    blurb: 'רצפטורים ומנגנוני פעולה, עקומת מנה-תגובה, העברת אות, אינדקס וחלון טיפולי, סבילות ושילובי תרופות. עם סימולטור, מחשבון וכרטיסיות.',
  },
];

/** The summaries of one subject, in list order. */
export const summariesFor = (subjectId) => SUMMARIES.filter((s) => s.subject === subjectId);

/** Page file for a summary, relative to the summaries/ folder. */
export const summaryFile = (id) => `${id}.html`;
