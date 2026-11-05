// The interactive labs, in the order the hub shows them. Each id is a page labs/<id>.html.
// No DOM here, so the Node tests can check it against the files.

export const LABS = [
  {
    id: 'hypertension',
    title: 'מעבדת לחץ הדם',
    blurb: 'מעכבי ACE, ARB, חוסמי אלפא ובטא ו‑CCB: מנגנון, תופעה אופיינית והתווית נגד.',
  },
  {
    id: 'diuretics',
    title: 'מעבדת המשתנים',
    blurb: 'תיאזידים, לולאה, חוסכי אשלגן, קרבוניק אנהידרז ואוסמוטיים לפי מקום הפעולה בנפרון.',
  },
  {
    id: 'ischemia',
    title: 'מעבדת הלב',
    blurb: 'תעוקת חזה ו‑ACS, אי ספיקת לב, תרופות יונוטרופיות והפרעות קצב.',
  },
];

/** Page file for a lab, relative to the labs/ folder. */
export const labFile = (id) => `${id}.html`;
