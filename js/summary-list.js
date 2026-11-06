// The short summaries, in the order the hub and the combined print show them. Each id is a page
// summaries/<id>.html whose <article class="summary" data-system="<id>"> holds the content, and
// `subject` is the id of its subject in quizzes/subjects.json.
// `unit` (optional) is the catalog unit the summary belongs to, shown on its hub card.
// `study: true` means study/<id>.html (interactive practice) exists too.
// `tool: '<name>'` is an interactive summary that lives at tools/<name>.html instead of a static
// summaries/<id>.html page: it is listed and linked like a summary, but it is not part of the
// combined print page (all.html) and has no summary.css accent.
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
  {
    subject: 'pharmacology',
    id: 'parasympathetic',
    title: 'תרופות במערכת הפאראסימפתטית',
    blurb: 'הסינפסה הכולינרגית, רצפטורים מוסקריניים וניקוטיניים, אגוניסטים ומעכבי AChE, אנטגוניסטים וחוסמי עצב-שריר. עם סימולטור איברים, סיור בסינפסה וכרטיסיות.',
  },
  {
    subject: 'pharmacology',
    id: 'sympathetic',
    title: 'תרופות במערכת הסימפתטית',
    blurb: 'רצפטורים אדרנרגיים, קטכולאמינים, אגוניסטים ישירים ועקיפים, חוסמי α ו-β ונוהל דליפת NE. עם סייר רצפטורים, מצב בחינה עצמית, מעקב התקדמות וכרטיסיות.',
  },
  {
    subject: 'pharmacology',
    id: 'opioids',
    title: 'אופיואידים',
    blurb: 'רצפטורי μ, κ ו-δ, תופעות לוואי, סבילות וגמילה, 4 משפחות כימיות ואלרגיה צולבת, נוהל הרעלה ו-Naloxone. עם סייר רצפטורים, מצב בחינה עצמית, מעקב התקדמות וכרטיסיות.',
  },
  {
    subject: 'pharmacology',
    id: 'nsaids',
    title: 'NSAIDs: דלקת, כאב וחום',
    blurb: 'מסלול חומצה ארכידונית, COX-1 מול COX-2, אספירין ואקמול, לויקוטריאנים, שיגדון, RA ומיגרנה. עם סייר מסלול, מצב בחינה עצמית, מעקב התקדמות וכרטיסיות.',
  },
  {
    subject: 'pharmacology',
    id: 'coagulation',
    title: 'תרופות בהפרעות קרישה',
    blurb: 'נוגדי טסיות, הפרין, וורפרין ו-DOACs, טרומבוליטים, סמי-נגד ו-HIT. עם סייר שלבי הקרישה, מצב בחינה עצמית, מעקב התקדמות וכרטיסיות.',
  },
  {
    subject: 'pharmacology',
    id: 'pharma-hyperlipidemia',
    title: 'היפרליפידמיה ושומנים בדם',
    blurb: 'LDL ו‑HDL, סטטינים, Ezetimibe, פיברטים, Niacin ותרופות חדשות.',
  },
  {
    subject: 'pharmacology',
    id: 'pharma-parkinson',
    title: 'פרקינסון ומחלות ניווניות',
    blurb: 'דופמין מול אצטילכולין, L-Dopa ותוספי עזר, אגוניסטים, אלצהיימר ו‑ALS.',
  },
  {
    subject: 'pharmacology',
    id: 'pharma-anxiety',
    title: 'נוגדי חרדה ומשרי שינה',
    blurb: 'GABA‑A, בנזודיאזפינים, ברביטורטים, Buspirone, תרופות Z.',
  },
  {
    subject: 'pharmacology',
    id: 'pharma-depression',
    title: 'נוגדי דיכאון ומייצבי מצב רוח',
    blurb: 'SSRI, SNRI, TCA ו‑MAOI, סינדרום סרוטונין, טיראמין, ליתיום.',
  },
  {
    subject: 'pharmacology',
    id: 'pharma-psychosis',
    title: 'תרופות אנטי‑פסיכוטיות',
    blurb: 'חסימת D2, ארבעת המסלולים הדופמינרגיים, דור ראשון מול שני, EPS, Clozapine.',
  },
  {
    subject: 'pharmacology',
    id: 'pharma-epilepsy',
    title: 'נוגדי פרכוסים (אפילפסיה)',
    blurb: 'סוגי התקפים, ארבעת המנגנונים, תרופה לפי סוג התקף, הריון ו‑status epilepticus.',
  },
  {
    subject: 'pharmacology',
    id: 'pharma-anesthesia',
    title: 'חומרי הרדמה',
    blurb: 'גזים נדיפים ו‑MAC, חומרי הרדמה תוך‑ורידיים, חוסמים נוירומוסקולריים, הרדמה מקומית.',
  },
  {
    subject: 'pharmacology',
    id: 'pharma-antihistamines',
    title: 'אנטיהיסטמינים',
    blurb: 'היסטמין ורצפטורי H1–H4, דור ראשון מול דור שני, שימושים ותופעות לוואי.',
  },
  {
    subject: 'pharmacology',
    id: 'pharma-git',
    title: 'תרופות במערכת העיכול',
    blurb: 'בקרת חומצה וכיב, שלשול ועצירות, בחילות והקאות, מעי רגיז ומחלות מעי דלקתיות.',
  },
  {
    subject: 'pharmacology',
    id: 'pharma-respiratory',
    title: 'תרופות למערכת הנשימה',
    blurb: 'אסטמה ו-COPD: מרחיבי סמפונות, נוגדי דלקת, טיפול ביולוגי, ניהול הטיפול ותופעות הלוואי של סטרואידים.',
  },
  {
    subject: 'pharmacology',
    id: 'pharma-immunosuppression',
    title: 'תרופות לדיכוי חיסוני',
    blurb: 'מניעת דחיית שתל: שלבי הטיפול, נוגדנים, מעכבי קלצינאורין ו-mTOR, אנטי-פרוליפרטיביים וסטרואידים, וסיעוד.',
  },
  {
    subject: 'pharmacology-b',
    id: 'pharma-b-pituitary',
    unit: 'מבוא אנדוקרינולוגיה ויותרת המוח',
    title: 'סיכום ההיפופיזה',
    blurb: 'הורמונים הם שליחים כימיים. כאן עוברים על סוגי ההורמונים, על לולאות המשוב ועל הציר של ההיפותלמוס וההיפופיזה, ואחר כך על כל תרופה לפי משפחה, מנגנון ותופעות לוואי.',
  },
  {
    subject: 'pharmacology-b',
    id: 'pharma-b-thyroid',
    unit: 'בלוטת התריס',
    title: 'סיכום התריס',
    blurb: 'בלוטת התריס קובעת את קצב המטבוליזם של הגוף. כאן עוברים על הסינתזה של T3 ו-T4, על הבקרה של TSH, ועל התרופות להיפו והיפר-תירואידיזם.',
  },
  {
    subject: 'pharmacology-b',
    id: 'pharma-b-sex-hormones',
    unit: 'הורמוני מין ואמצעי מניעה',
    title: 'סיכום הורמוני המין',
    blurb: 'אסטרוגנים, פרוגסטרון ואנדרוגנים מיוצרים מכולסטרול ופועלים דרך קולטן בגרעין. כאן עוברים על התרופות לפי משפחה: טיפול הורמונלי, SERMs, אמצעי מניעה ואנטי אנדרוגנים.',
  },
  {
    subject: 'pharmacology-b',
    id: 'pharma-b-adrenal',
    unit: 'אדרנל וסטרואידים',
    title: 'סיכום האדרנל',
    blurb: 'קורטקס האדרנל מייצר שלוש משפחות הורמונים. כאן עוברים על המבנה, על הגלוקוקורטיקואידים, על אלדוסטרון, על המחלות שבהן משתמשים בסטרואידים ועל תופעות הלוואי של טיפול ארוך.',
  },
  {
    subject: 'pharmacology-b',
    id: 'pharma-b-insulin',
    unit: 'סוכרת א׳: פיזיולוגיה ואינסולין',
    title: 'סיכום הסוכרת: אינסולין',
    blurb: 'איך הגוף מווסת גלוקוז, מה משתבש בסוכרת, ואילו אינסולינים ותרופות הזרקה קיימות: אינסולין, אמילין ואינקרטינים.',
  },
  {
    subject: 'pharmacology-b',
    id: 'pharma-b-oral-diabetes',
    unit: 'סוכרת ב׳: תרופות לא-אינסוליניות',
    title: 'סיכום הסוכרת: תרופות פומיות',
    blurb: 'שבע משפחות של תרופות פומיות לסוכרת מסוג 2. לכל משפחה מנגנון אחר, ותופעות לוואי אחרות.',
  },
  {
    subject: 'pharmacology-b',
    id: 'tool-hypertension',
    tool: 'hypertension',
    unit: 'יתר לחץ דם: ACE, ARB, אלפא, בטא, CCB',
    title: 'סיכום לחץ הדם',
    blurb: 'תרופות ליתר לחץ דם לפי קבוצות: מעכבי ACE, חוסמי ARB, חוסמי אלפא ובטא וחוסמי תעלות סידן. לכל קבוצה יש מנגנון, תופעה אופיינית והתווית נגד.',
  },
  {
    subject: 'pharmacology-b',
    id: 'tool-diuretics',
    tool: 'diuretics',
    unit: 'משתנים',
    title: 'סיכום המשתנים',
    blurb: 'חמש קבוצות משתנים לפי מקום הפעולה בנפרון: תיאזידים, לולאה, חוסכי אשלגן, מעכבי קרבוניק אנהידרז ואוסמוטיים. מה פועל איפה ומה קורה לאשלגן ולסידן.',
  },
  {
    subject: 'pharmacology-b',
    id: 'tool-ischemia',
    tool: 'ischemia',
    unit: 'איסכמיה, אי-ספיקת לב והפרעות קצב',
    title: 'סיכום הלב',
    blurb: 'תעוקת חזה ותסמונת כלילית חריפה, אי ספיקת לב ותרופות יונוטרופיות, והפרעות קצב לפי ארבע המחלקות.',
  },
  {
    subject: 'pharmacology-b',
    id: 'tool-oncology',
    tool: 'oncology',
    unit: 'אונקולוגיה: עקרונות ועמידות',
    title: 'סיכום האונקולוגיה: עקרונות',
    blurb: 'איך כימותרפיה עובדת, למה היא פוגעת גם בתאים בריאים, ולמה גידולים נעשים עמידים.',
  },
  {
    subject: 'pharmacology-b',
    id: 'tool-chemo',
    tool: 'chemo',
    unit: 'אונקולוגיה: משפחות התרופות',
    title: 'סיכום הכימותרפיה: משפחות התרופות',
    blurb: 'כל משפחה כימותרפית עם המנגנון, הרעילות הייחודית וההגנה שלה.',
  },
  {
    subject: 'pharmacology-b',
    id: 'tool-antibiotics-wall',
    tool: 'antibiotics-wall',
    unit: 'אנטיביוטיקה א׳: עקרונות ודופן התא',
    title: 'סיכום האנטיביוטיקה: עקרונות ודופן התא',
    blurb: 'מהעקרונות של טיפול אנטיביוטי ועד תרופות שפוגעות בדופן התא החיידקית.',
  },
  {
    subject: 'pharmacology-b',
    id: 'tool-antibiotics-dna',
    tool: 'antibiotics-dna',
    unit: 'אנטיביוטיקה ב׳: סינתזת חלבון וחומצות גרעין',
    title: 'סיכום האנטיביוטיקה: ריבוזום ו-DNA',
    blurb: 'תרופות המעכבות את הריבוזום, ה-DNA והחומצה הפולית, ותכשירים ייעודיים לעמידים.',
  },
  {
    subject: 'pharmacology-b',
    id: 'tool-tb-viruses',
    tool: 'tb-viruses',
    unit: 'שחפת ותרופות נגד וירוסים',
    title: 'סיכום השחפת והנגיפים',
    blurb: 'ארבע תרופות שחפת, תרופות נגד שפעת, RSV והרפס, והאסטרטגיה נגד HIV.',
  },
  {
    subject: 'pharmacology-b',
    id: 'tool-fungi',
    tool: 'fungi',
    unit: 'פטריות, טפילים ותולעים',
    title: 'סיכום הפטריות',
    blurb: 'פוליאנים, אזולים, אקינוקנדינים ותרופות נוספות: מטרה, תופעות לוואי והתאמת תרופה לזיהום.',
  },
  {
    subject: 'pharmacology-b',
    id: 'tool-routes',
    tool: 'routes',
    unit: 'סיעוד: דרכי מתן לא-פרנטרליות',
    title: 'סיכום דרכי המתן',
    blurb: 'פומי, תת לשוני, נשימה, נרתיק ורקטום, עור, אף, עין ואוזן: הכנה, טכניקה ומלכודות בטיחות.',
  },
  {
    subject: 'pharmacology-b',
    id: 'tool-injections',
    tool: 'injections',
    unit: 'סיעוד: הזרקות ומתן דרך הווריד',
    title: 'סיכום ההזרקות והעירוי',
    blurb: 'ארבעה סוגי הזרקה, אתרים נכונים, מחטים וסיבוכי עירוי.',
  },
  {
    subject: 'nursing-fundamentals',
    id: 'circulars',
    title: 'מפת החוזרים והפעולות',
    blurb: 'פעולת סיעוד מול פעולה חריגה ורפואית, חוזרים לפי נושא, כוח עזר מיומן וחוקים. עם מפה אינטראקטיבית.',
  },
  {
    subject: 'nursing-fundamentals',
    id: 'safety',
    title: 'בטיחות ובטחון',
    blurb: 'נפילות והגבלה פיזית: כלי אומדן, צ\'קליסט, אבחנות סיכון ושעון הנוהל. יש גם סיכום אינטראקטיבי נפרד.',
  },
  {
    subject: 'nursing-fundamentals',
    id: 'tool-safety',
    tool: 'safety',
    unit: 'בטיחות ובטחון',
    title: 'סיכום הבטיחות',
    blurb: 'גורמים ונפילות, מחשבון סיכון, אבחנות סיעוד, שעון ההגבלה הפיזית ויעדי בטיחות.',
  },
  {
    subject: 'nursing-fundamentals',
    id: 'hygiene',
    title: 'היגיינה ואומדן העור',
    blurb: 'מבנה העור, ממצאי עור, מודל רמת התפקוד, טיפול בפה ובחושים ורחצה. עם כרטיסיות וחידון.',
  },
  {
    subject: 'nursing-fundamentals',
    id: 'tissue-integrity',
    title: 'שלמות הרקמה',
    blurb: 'פצעים אקוטיים וכרוניים, שלבי ריפוי, פצעי לחץ, נורטון וברדן וחוזר 153. עם כרטיסיות וחידון.',
  },
  {
    subject: 'nursing-fundamentals',
    id: 'mobility',
    title: 'ניעות',
    blurb: 'חוזר 249/2025, השפעת שכיבה לפי מערכות, סיבוכים, תנוחות, ארגונומיה ו‑Deconditioning. עם כרטיסיות וחידון.',
  },
  {
    subject: 'nursing-fundamentals',
    id: 'sleep',
    title: 'מנוחה ושינה',
    blurb: 'שלבי NREM ו‑REM, מלטונין ומקצב צירקדי, הפרעות שינה, דום נשימה והיגיינת שינה. עם כרטיסיות וחידון.',
  },
  {
    subject: 'nursing-fundamentals',
    study: true,
    id: 'urinary',
    title: 'מערכת השתן',
    blurb: 'ערכי שתן תקינים, הפרעות במתן שתן, DIAPPERS, צנתור והטיית שתן. עם תרגול אינטראקטיבי.',
  },
  {
    subject: 'nursing-fundamentals',
    study: true,
    id: 'gi',
    title: 'מערכת העיכול וההפרשות',
    blurb: 'סולם בריסטול, תכשירים משלשלים וחוקן, אבני צואה וסטומה. עם תרגול אינטראקטיבי.',
  },
  {
    subject: 'nursing-fundamentals',
    id: 'bowel',
    title: 'הפרשות מערכת העיכול (חוזר 248/2025)',
    blurb: 'סולם ההתערבות, אי שליטה על צואה, משלשלים, חוקן, אבני צואה, בדיקות וסטומה.',
  },
  {
    subject: 'nursing-fundamentals',
    id: 'sensory',
    title: 'גירוי סנסורי',
    blurb: 'קליטה ותפיסה, RAS ומצבי מודעות, חסך והצפה, אבחנות NANDA והתערבות.',
  },
];

/** The summaries of one subject, in list order. */
export const summariesFor = (subjectId) => SUMMARIES.filter((s) => s.subject === subjectId);

/** Page file for a summary, relative to the summaries/ folder. */
export const summaryFile = (id) => {
  const entry = SUMMARIES.find((s) => s.id === id);
  return entry?.tool ? `../tools/${entry.tool}.html` : `${id}.html`;
};

/** Interactive study page for a summary, relative to the summaries/ folder. */
export const studyFile = (id) => `../study/${id}.html`;
