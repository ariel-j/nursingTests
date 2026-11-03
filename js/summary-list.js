// The short summaries, in the order the hub and the combined print show them. Each id is a page
// summaries/<id>.html whose <article class="summary" data-system="<id>"> holds the content.
// `subject` groups the hub and must be a subject from quizzes/subjects.json. A lab (an interactive
// summary) also names its `unit` and the `quiz` of that unit used for its warm-up; its article then
// carries data-quiz="<quiz>". No DOM here, so the Node tests can check it against the files.

const ANATOMY = 'אנטומיה ופיזיולוגיה';
const PHARM = 'פרמקולוגיה ב';

export const SUMMARIES = [
  {
    id: 'cardiovascular',
    subject: ANATOMY,
    title: 'המערכת הקרדיווסקולרית',
    blurb: 'הלב כמשאבה, הולכה חשמלית ו‑ECG, מחזור הלב, תפוקת הלב ולחץ הדם.',
  },
  {
    id: 'excretory',
    subject: ANATOMY,
    title: 'מערכת ההפרשה (הכליה)',
    blurb: 'הנפרון, סינון, ספיגה חוזרת והפרשה, ADH ו‑RAAS, מאזן חומצה–בסיס.',
  },
  {
    id: 'endocrine',
    subject: ANATOMY,
    title: 'המערכת האנדוקרינית',
    blurb: 'סוגי הורמונים, ציר היפותלמוס–היפופיזה, תריס, אדרנל, לבלב ואצטרובל.',
  },
  {
    id: 'digestive',
    subject: ANATOMY,
    title: 'מערכת העיכול',
    blurb: 'הפה והקיבה, לבלב, כבד ומרה, ספיגה, המעי הגס ובקרה עצבית.',
  },
  {
    id: 'pharm-pituitary',
    subject: PHARM,
    unit: 'מבוא אנדוקרינולוגיה ויותרת המוח',
    quiz: 'endocrine-pituitary-1',
    title: 'מעבדת ההיפופיזה',
    blurb: 'הורמונים הם שליחים כימיים. כאן עוברים על סוגי ההורמונים, על לולאות המשוב ועל הציר של ההיפותלמוס וההיפופיזה, ואחר כך על כל תרופה לפי משפחה, מנגנון ותופעות לוואי.',
  },
  {
    id: 'pharm-thyroid',
    subject: PHARM,
    unit: 'בלוטת התריס',
    quiz: 'endocrine-thyroid-1',
    title: 'מעבדת התריס',
    blurb: 'בלוטת התריס קובעת את קצב המטבוליזם של הגוף. כאן עוברים על הסינתזה של T3 ו-T4, על הבקרה של TSH, ועל התרופות להיפו והיפר-תירואידיזם.',
  },
  {
    id: 'pharm-sex-hormones',
    subject: PHARM,
    unit: 'הורמוני מין ואמצעי מניעה',
    quiz: 'endocrine-sex-hormones-1',
    title: 'מעבדת הורמוני המין',
    blurb: 'אסטרוגנים, פרוגסטרון ואנדרוגנים מיוצרים מכולסטרול ופועלים דרך קולטן בגרעין. כאן עוברים על התרופות לפי משפחה: טיפול הורמונלי, SERMs, אמצעי מניעה ואנטי אנדרוגנים.',
  },
  {
    id: 'pharm-adrenal',
    subject: PHARM,
    unit: 'אדרנל וסטרואידים',
    quiz: 'endocrine-adrenal-1',
    title: 'מעבדת האדרנל',
    blurb: 'קורטקס האדרנל מייצר שלוש משפחות הורמונים. כאן עוברים על המבנה, על הגלוקוקורטיקואידים, על אלדוסטרון, על המחלות שבהן משתמשים בסטרואידים ועל תופעות הלוואי של טיפול ארוך.',
  },
  {
    id: 'pharm-insulin',
    subject: PHARM,
    unit: 'סוכרת א: פיזיולוגיה ואינסולין',
    quiz: 'endocrine-diabetes-1',
    title: 'מעבדת הסוכרת: אינסולין',
    blurb: 'איך הגוף מווסת גלוקוז, מה משתבש בסוכרת, ואילו אינסולינים ותרופות הזרקה קיימות: אינסולין, אמילין ואינקרטינים.',
  },
  {
    id: 'pharm-oral-diabetes',
    subject: PHARM,
    unit: 'סוכרת ב: תרופות פומיות',
    quiz: 'endocrine-diabetes-2',
    title: 'מעבדת הסוכרת: תרופות פומיות',
    blurb: 'שבע משפחות של תרופות פומיות לסוכרת מסוג 2. לכל משפחה מנגנון אחר, ותופעות לוואי אחרות.',
  },
];

/** Page file for a summary, relative to the summaries/ folder. */
export const summaryFile = (id) => `${id}.html`;
