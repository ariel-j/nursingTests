// The short summaries, in the order the hub and the combined print show them. Each id is a page
// summaries/<id>.html whose <article class="summary" data-system="<id>"> holds the content.
// `subject` groups the hub; `study: true` means study/<id>.html (interactive practice) exists too.
// No DOM here, so the Node tests can check it against the files.

export const SUMMARIES = [
  {
    id: 'cardiovascular',
    subject: 'אנטומיה ופיזיולוגיה',
    title: 'המערכת הקרדיווסקולרית',
    blurb: 'הלב כמשאבה, הולכה חשמלית ו‑ECG, מחזור הלב, תפוקת הלב ולחץ הדם.',
  },
  {
    id: 'excretory',
    subject: 'אנטומיה ופיזיולוגיה',
    title: 'מערכת ההפרשה (הכליה)',
    blurb: 'הנפרון, סינון, ספיגה חוזרת והפרשה, ADH ו‑RAAS, מאזן חומצה–בסיס.',
  },
  {
    id: 'endocrine',
    subject: 'אנטומיה ופיזיולוגיה',
    title: 'המערכת האנדוקרינית',
    blurb: 'סוגי הורמונים, ציר היפותלמוס–היפופיזה, תריס, אדרנל, לבלב ואצטרובל.',
  },
  {
    id: 'digestive',
    subject: 'אנטומיה ופיזיולוגיה',
    title: 'מערכת העיכול',
    blurb: 'הפה והקיבה, לבלב, כבד ומרה, ספיגה, המעי הגס ובקרה עצבית.',
  },
  {
    id: 'urinary',
    subject: 'יסודות להתערבות ומיומנויות סיעודיות',
    study: true,
    title: 'מערכת השתן',
    blurb: 'ערכי שתן תקינים, הפרעות במתן שתן, DIAPPERS, צנתור והטיית שתן.',
  },
  {
    id: 'gi',
    subject: 'יסודות להתערבות ומיומנויות סיעודיות',
    study: true,
    title: 'מערכת העיכול וההפרשות',
    blurb: 'סולם בריסטול, תכשירים משלשלים וחוקן, אבני צואה וסטומה.',
  },
];

/** Page file for a summary, relative to the summaries/ folder. */
export const summaryFile = (id) => `${id}.html`;

/** Interactive study page for a summary, relative to the summaries/ folder. */
export const studyFile = (id) => `../study/${id}.html`;

/** The summaries grouped by subject, subjects in order of first appearance. */
export function bySubject(list = SUMMARIES) {
  const groups = new Map();
  for (const s of list) {
    if (!groups.has(s.subject)) groups.set(s.subject, []);
    groups.get(s.subject).push(s);
  }
  return [...groups].map(([subject, items]) => ({ subject, items }));
}
