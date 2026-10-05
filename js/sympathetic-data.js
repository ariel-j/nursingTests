// Text data and pure logic for the sympathetic summary's widgets (no DOM, no storage; checked by the
// Node tests). Strings use the markup of rich.js (**bold**, `Latin`, \n).
export { parseRich, isBalanced } from './rich.js';

// ---------- receptor explorer ----------
// `tone` is the G protein's color: Gq amber, Gi rose, Gs blue (same tones as the page's buttons).

export const RECEPTORS = [
  {
    key: 'alpha1',
    symbol: 'α1',
    g: 'Gq',
    tone: 'amber',
    title: 'רצפטור `α1` (אלפא-1)',
    pathway: 'שפעול `Phospholipase C (PLC)` ← פירוק `PIP2` ל-`IP3` ו-`DAG` ← שחרור `Ca²⁺` תוך-תאי מהרשתית האנדופלזמתית',
    organs: 'שריר חלק בכלי דם, שריר מרחיב אישון (`Pupillary dilator`), ספינקטר פנימי של שלפוחית השתן, מערכת העיכול, דרכי הזרע',
    effects: [
      'כיווץ כלי דם עורקיים וורידיים (`Vasoconstriction`) המעלה את התנגודת ההיקפית (`TPR`) ולחץ הדם',
      'הרחבת אישון (`Mydriasis`) בעין ללא פגיעה באקומודציה',
      'כיווץ ספינקטר השלפוחית (אצירת שתן)',
      'כיווץ שריר חלק בערמונית',
    ],
    agonists: '`Phenylephrine, Midodrine, Tetrahydrozoline, Naphazoline, Oxymetazoline`',
    antagonists: '`Prazosin, Terazosin, Doxazosin, Phenoxybenzamine, Phentolamine`',
    pearl: 'אגוניסט של `α1` מעלה לחץ דם ומפעיל ברו-רצפטורים המובילים ל-`Reflex Bradycardia` (האטת דופק רפלקסיבית).',
  },
  {
    key: 'alpha2',
    symbol: 'α2',
    g: 'Gi',
    tone: 'rose',
    title: 'רצפטור `α2` (אלפא-2)',
    pathway: 'עיכוב `Adenylyl Cyclase (AC)` ← ירידה בריכוז `cAMP` תוך-תאי ← עיכוב תעלות סידן ושפעול תעלות אשלגן',
    organs: 'קרום פרה-סינפטי של נוירונים סימפתטיים ומרכז הפיקוח הוואזומוטורי בגזע המוח (`CNS`), טסיות דם, תאי בטא בלבלב',
    effects: [
      '`Autoreceptor` מעכב: הפעלתו עוצרת שחרור `NE` ו-`ACh` מהסינפסה',
      'הפחתת הטונוס הסימפתטי המרכזי המובילה לירידה בלחץ הדם ובדופק',
      'עיכוב שחרור אינסולין מתאי בטא בלבלב',
    ],
    agonists: '`Clonidine, Methyldopa, Lofexidine, Guanfacine`',
    antagonists: '`Yohimbine` (ללא שימוש קליני מובהק), `Phentolamine` (לא סלקטיבי)',
    pearl: '**מלכודת מבחן!** אגוניסט של `α2` מוריד לחץ דם, והפסקה פתאומית שלו מובילה ל-`Rebound Hypertension` מסכן חיים!',
  },
  {
    key: 'beta1',
    symbol: 'β1',
    g: 'Gs',
    tone: 'blue',
    title: 'רצפטור `β1` (בטא-1)',
    pathway: 'שפעול `Adenylyl Cyclase` ← עלייה ב-`cAMP` ← שפעול `PKA` וזרחון תעלות `Ca²⁺` מסוג `L` בלב',
    organs: 'לב (תאי קוצב `SA/AV` ושריר הלב `Ventricles`), תאי `JG` בכליה',
    effects: [
      'עלייה בקצב הלב (`Positive Chronotropy`)',
      'עלייה בעוצמת כיווץ הלב (`Positive Inotropy`)',
      'עלייה במהירות ההולכה החשמלית (`Positive Dromotropy`)',
      'הפרשת רנין (`Renin`) מוגברת בכליה ← הפעלת `RAAS` ← עלייה בל"ד',
    ],
    agonists: '`Dobutamine, Isoproterenol, Epinephrine, Norepinephrine, Dopamine`',
    antagonists: '`Atenolol, Metoprolol, Bisoprolol, Esmolol`, `Propranolol` (לא סלקטיבי)',
    pearl: 'תרופות `β1` קרדיוסלקטיביות (כמו `Atenolol`) עדיפות בחולי נשימה, אך **במינון גבוה מאבדות את הסלקטיביות** ופועלות גם על `β2`!',
  },
  {
    key: 'beta2',
    symbol: 'β2',
    g: 'Gs',
    tone: 'blue',
    title: 'רצפטור `β2` (בטא-2)',
    pathway: 'שפעול `Adenylyl Cyclase` ← `cAMP`↑ ← `PKA` מזרחנת ומעכבת את `Myosin Light Chain Kinase (MLCK)` בשריר חלק',
    organs: 'שריר חלק בסמפונות הריאה, כלי דם בשרירי שלד, שריר הרחם (`Myometrium`), כבד',
    effects: [
      'הרחבת דרכי נשימה (`Bronchodilation`) — הקלה על התקפי אסטמה',
      'הרחבת כלי דם המספקים שרירי שלד (`Vasodilation`)',
      'הרפיית שריר הרחם (טוקוליזה לעצירת צירים מוקדמים)',
      'גליקוגנוליזה וגלוקונאוגנזה בכבד (העלאת גלוקוז בדם)',
    ],
    agonists: '`Albuterol (Salbutamol), Terbutaline, Salmeterol, Formoterol`',
    antagonists: '`Propranolol, Timolol, Nadolol` (אינם סלקטיביים — אסורים באסטמה!)',
    pearl: 'חוסם בטא לא-סלקטיבי יחסום את `β2` ויגרום לברונכוקונסטריקציה קטלנית באסטמה. תופעת לוואי של אגוניסט ל-`β2`: **רעד בשרירי שלד** (`Tremor`).',
  },
  {
    key: 'beta3',
    symbol: 'β3',
    g: 'Gs',
    tone: 'blue',
    title: 'רצפטור `β3` (בטא-3)',
    pathway: 'שפעול `AC` ועלייה ב-`cAMP` ברקמות שומן ובשלפוחית השתן',
    organs: 'שריר ה-`Detrusor` בשלפוחית השתן, רקמת שומן לבנה וחומה',
    effects: [
      'הרפיית שריר ה-`Detrusor` של שלפוחית השתן המאפשרת אגירת שתן טובה יותר',
      'הגברת פירוק שומנים (`Lipolysis`) ברקמות שומן',
    ],
    agonists: '`Mirabegron, Vibegron` (לטיפול בשלפוחית רגיזה)',
    antagonists: 'אין אנטגוניסט קליני ייעודי',
    pearl: '`Mirabegron` מיועדת ל-`Overactive Bladder` כתחליף לתרופות אנטי-כולינרגיות; תופעת הלוואי העיקרית שלה היא **עלייה בלחץ הדם**.',
  },
  {
    key: 'd1',
    symbol: 'D1',
    g: 'Gs',
    tone: 'blue',
    title: 'רצפטור `D1` (דופמינרגי)',
    pathway: 'שפעול `Adenylyl Cyclase` ← עלייה ב-`cAMP` ← הרפיית שריר חלק וסקולרי',
    organs: 'כלי דם כלייתיים (`Renal`), כלי דם מזנטריים בבטן, עורקים כליליים',
    effects: [
      'הרחבת עורקים כלייתיים והגברת זרימת הדם והזילוח לכליה (`GFR`↑)',
      'הפרשת נתרן בשתן (`Natriuresis`)',
      'ירידה בתנגודת כלי הדם המערכתית',
    ],
    agonists: '`Fenoldopam` (למשברי יתר לחץ דם `IV`), `Dopamine` (במינון נמוך)',
    antagonists: 'חוסמי דופמין כגון נוירולפטיים',
    pearl: '`Fenoldopam` מרחיב כלי דם ומגן על הכליה במשברי יתר לחץ דם, בניגוד לתרופות אחרות שעלולות לפגוע בזילוח הכלייתי.',
  },
];

// ---------- flashcards: the exam recalls ----------
// Plain text (the flashcard writes it with textContent). `repeats` is the badge on the card's front.

export const FLASHCARDS = [
  {
    q: 'מהי ההדרכה הקריטית והאפקט המסוכן במתן מנה ראשונה של Prazosin?',
    a: 'תופעת Postural (Orthostatic) Hypotension ואפקט מנה ראשונה (1st dose syncope). חסימת α1 מונעת כיווץ ורידי תגובתי לעמידה, ולכן יש להדריך את החולה ליטול את המנה הראשונה לפני השינה, ולקום תמיד בהדרגה ובאיטיות מישיבה או משכיבה לעמידה.',
    repeats: 'נשאל בשחזורים ×3',
  },
  {
    q: 'מדוע Propranolol אסור בהחלט לשימוש בחולי אסטמה ו-COPD?',
    a: 'מכיוון ש-Propranolol הוא חוסם β לא-סלקטיבי; הוא חוסם לא רק את β1 בלב אלא גם את β2 בסמפונות הריאה, דבר המוביל לברונכוקונסטריקציה קשה ולסכנת חנק קטלנית.',
    repeats: 'נשאל בשחזורים ×2',
  },
  {
    q: 'מהו מנגנון הפעולה הפרמקולוגי המדויק של Atenolol?',
    a: 'Atenolol הוא אנטגוניסט סלקטיבי לקולטני בטא-1 (Cardioselective β1-Blocker). הוא מאט את קצב הלב ואת כוח ההתכווצות ומוריד הפרשת רנין, עם השפעה מופחתת על דרכי הנשימה.',
    repeats: 'נשאל בשחזורים ×2',
  },
  {
    q: 'כיצד פועל Amphetamine במערכת הסימפתטית ולאילו התוויות הוא מיועד?',
    a: 'אמפטמין הוא אגוניסט עקיף: הוא משחרר קטכולאמינים (NE ודופמין) מהווסיקולות הנוירונליות ומעכב את החזרתם (Reuptake) ואת הפירוק ע"י MAO. התוויותיו: ADHD ונרקולפסיה.',
    repeats: 'נשאל בשחזורים ×2',
  },
  {
    q: 'מה קורה לרצפטורים אדרנרגיים בעקבות חשיפה ממושכת לאנטגוניסט (חוסם)?',
    a: 'חל תהליך של Up-regulation (עלייה במספר ובצפיפות הרצפטורים על גבי הממברנה), המוביל למצב של רגישות יתר (Hyperreactivity / Rebound) אם הטיפול מופסק בבת אחת.',
    repeats: 'נשאל בשחזורים ×2',
  },
  {
    q: 'אילו שינויים אופייניים מתרחשים בעין ובדרכי הנשימה בעת הפעלת המערכת הסימפתטית?',
    a: 'בעין: מידריאזיס (Mydriasis — הרחבת אישונים) ע"י כיווץ שריר ה-Pupillary Dilator (רצפטור α1). בדרכי הנשימה: ברונכודילטציה (הרחבת סמפונות) ע"י הרפיית שריר חלק (רצפטור β2).',
    repeats: 'נשאל בשחזורים ×2',
  },
  {
    q: 'מדוע מוסיפים Phenylephrine למאלחש מקומי (כמו Lidocaine)?',
    a: 'כדי לגרום לוואזוקונסטריקציה מקומית (הפעלת α1), אשר מאטה את קצב ספיגת המאלחש אל מחזור הדם הסיסטמי, מאריכה משמעותית את משך האלחוש המקומי ומפחיתה סיכון לרעילות.',
    repeats: 'נשאל בשחזורים',
  },
  {
    q: 'מהי תרופת הבחירה הראשונה והמצילה חיים בשוק אנפילקטי (Anaphylaxis)?',
    a: 'אדרנלין (Epinephrine) בהזרקה תוך-שרירית (IM). הוא מרחיב סמפונות במהירות (β2), מכווץ כלי דם ומעלה ל"ד (α1), ומפחית שחרור היסטמין מתאי פיטום.',
    repeats: 'נשאל בשחזורים',
  },
  {
    q: 'מהו הטיפול המיידי הנדרש במקרה של דליפת Noradrenaline מהווריד לרקמה (Extravasation)?',
    a: 'הפסקת העירוי מיד והזרקה תת-עורית מקומית של האנטגוניסט Phentolamine (חוסם α) תוך 12 שעות, על מנת להרפות את כלי הדם המכווצים ולמנוע נמק איסכמי.',
    repeats: 'נשאל בשחזורים',
  },
  {
    q: 'מדוע אסור להפסיק טיפול ב-Clonidine באופן פתאומי?',
    a: 'כי קלונידין הוא אגוניסט של α2 המעכב שחרור NE. הפסקתו החדה מביאה להסרת העיכוב ולפרץ סימפתטי חוזר ומוגבר (Rebound Hypertension) עם סכנת שבץ ואירועי לב.',
    repeats: 'נשאל בשחזורים',
  },
];

// ---------- the reader's own "chapter done" marks ----------

/**
 * What the progress tracker shows. `saved` is whatever came out of storage (it can be anything, or from an
 * older version of the page), `sectionIds` are the chapters on the page now. Marks for chapters that no
 * longer exist are dropped.
 */
export function studyProgress(saved, sectionIds) {
  const known = new Set(sectionIds);
  const done = [...new Set(Array.isArray(saved) ? saved : [])].filter((id) => known.has(id));
  const total = sectionIds.length;
  return { done, count: done.length, total, percent: total === 0 ? 0 : Math.round((done.length / total) * 100) };
}

/** Marks with `id` switched on or off; keeps the page's chapter order so the saved list is stable. */
export function toggleDone(done, id, checked, sectionIds) {
  const next = new Set(done);
  if (checked) next.add(id);
  else next.delete(id);
  return sectionIds.filter((s) => next.has(s));
}
