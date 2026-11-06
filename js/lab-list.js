// The interactive labs (מעבדות), in the order the hub shows them. Each id is a page labs/<id>.html
// whose <main> carries data-lab="<id>" and data-quiz="<quiz id>": the closing mini-quiz draws its
// questions from quizzes/<quiz id>.json, so a lab never duplicates question text.
// No DOM here, so the Node tests can check it against the files.

export const LABS = [
  {
    id: 'fungi',
    quiz: 'fungi-1',
    title: 'מעבדת הפטריות',
    blurb: 'פוליאנים, אזולים, אקינוקנדינים ותרופות נוספות: מטרה, תופעות לוואי והתאמת תרופה לזיהום.',
  },
  {
    id: 'routes',
    quiz: 'routes-1',
    title: 'מעבדת דרכי המתן',
    blurb: 'פומי, תת לשוני, נשימה, נרתיק ורקטום, עור, אף, עין ואוזן: הכנה, טכניקה ומלכודות בטיחות.',
  },
  {
    id: 'injections',
    quiz: 'injections-1',
    title: 'מעבדת ההזרקות והעירוי',
    blurb: 'ארבעה סוגי הזרקה, אתרים נכונים, מחטים וסיבוכי עירוי.',
  },
];

/** Page file for a lab, relative to the labs/ folder. */
export const labFile = (id) => `${id}.html`;
