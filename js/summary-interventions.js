// Interactive parts of summaries/interventions.html: the action sorter, the circular filter,
// the skilled-aide check and the quick quiz. The summary text itself is static HTML (it prints).
import { mountChips, mountDrill } from './widgets.js';

const NURSING = 'פעולת סיעוד';
const UNUSUAL = 'פעולה חריגה';

const SORTER = [
  ['דפיברילציה במכשיר חצי אוטומטי', 0], ['שאיבה עמוקה מקנה הנשימה', 1], ['הוצאת אבני צואה', 0],
  ['הזרקת מורפין לקטטר אפידורלי לחולים סופניים', 1], ['התחלת עירוי ורידי פריפרי', 0],
  ['הוצאת קו עורקי (Arterial Line)', 1], ['החלטה על מתן אדרנלין', 0],
  ['שחרור מטופל אחרי סדציה לפי סולם ALDRETE', 1], ['החלטה על הגבלה פיזית לצורך טיפול רפואי', 0],
  ['הזרקה בדחף של כימותרפיה לווריד', 1], ['חוקן דרך קולוסטומי בתנאים שנקבעו בחוזר', 0],
  ['התאמת מכשיר הנשמה לגמילה ממנשם', 1],
];

// 1 = allowed, 2 = only assisting the nurse and in her presence, 0 = forbidden.
const AIDE_OPTIONS = ['מותר', 'מותר רק בסיוע לאחות ובנוכחותה', 'אסור'];
const AIDE_ANSWER = { 1: 0, 2: 1, 0: 2 };
const AIDE = [
  ['מדידת לחץ דם במכשיר אלקטרוני', 1], ['בדיקת סוכר בגלוקומטר', 1], ['ביצוע א.ק.ג', 1],
  ['החלפת שקית צנתר שתן', 1], ['האכלה דרך הפה', 1], ['החדרת זונדה לחולה', 2],
  ['הכנסת צנתר שתן', 2], ['הסרת וחבישת פצע', 2], ['טיפול בנפטר', 2],
  ['קבלת החלטה טיפולית עצמאית על שינוי תוכנית', 0], ['מישוש דופק ידני כשיטת ניטור', 0],
];

// Correct answer first; the drill reshuffles the options on every display.
const QUIZ = [
  ['פעולת סיעוד מותרת:', ['לכל אחות בעלת רישום תקף', 'רק לאחות עם הרשאה שמית', 'רק ביחידה שאישרה אותה', 'רק למי שהסכימה מראש'], 'בכל מקום שבו נדרש הטיפול.'],
  ['על איזה חוק מבוססת פעולה חריגה?', ['פקודת הרופאים', 'תקנות בריאות העם', 'חוק זכויות החולה', 'הקוד האתי'], 'עיסוק ברפואה שהואצל.'],
  ['חוזר 163/2020 עוסק ב:', ['כוח עזר מיומן', 'נפילות', 'פצעי לחץ', 'ניידות'], 'תחומי עיסוק והכשרה.'],
  ['חוזר 210/2023 מתיר לאחות:', ['להוציא צנתר שתן במחלקות פנימיות', 'להכניס צנתר ביולדות', 'להחליף צנתר בבית', 'להכניס צנתר בשיקום'], 'הוצאת צנתר במחלקות הפנימיות.'],
  ['חוזר 193/2022:', ['התחלת הזנה בהפרעות בליעה אחרי אומדן', 'החלפת גסטרוסטום', 'הוצאת אבני צואה', 'הכנסת זונדה'], 'שיקום, נוירולוגיה וגריאטריה.'],
  ['ההכשרה של כוח עזר היא לפחות:', ['120 שעות', '60 שעות', '200 שעות', '40 שעות'], 'והיא מסתיימת תוך שנה מהקליטה.'],
  ['חוזר 234/2025 ביטל את חוזר:', ['212/2024', '188/2021', '104/2014', '43/2001'], 'עדכון הריכוז.'],
  ['חוזר 126/2017 עוסק ב:', ['פצעי לחץ דרגה 1-2', 'פצעי לחץ דרגה 3-4', 'נפילות', 'היגיינת ידיים'], '3-4 הוא חוזר 166/2020.'],
];

function mount(name, config) {
  const root = document.querySelector(`[data-widget="${name}"]`);
  if (root) mountDrill(root, config);
}

mount('sorter', {
  items: SORTER.map(([prompt, answer]) => ({ prompt, options: [NURSING, UNUSUAL], answer })),
});

mount('aide', {
  items: AIDE.map(([prompt, v]) => ({ prompt, options: AIDE_OPTIONS, answer: AIDE_ANSWER[v] })),
});

mount('quiz', {
  shuffleOptions: true,
  items: QUIZ.map(([prompt, options, note]) => ({ prompt, options, answer: 0, note })),
});

// Circular → topic filter over the static table (the full table stays in the page for print).
const rows = [...document.querySelectorAll('#circulars tbody tr')];
const chipsRoot = document.querySelector('[data-widget="topics"]');
if (chipsRoot && rows.length) {
  const topics = ['הכול', ...new Set(rows.map((row) => row.dataset.topic))];
  mountChips(chipsRoot, {
    legend: 'סינון לפי נושא',
    values: topics,
    onChange(topic) {
      for (const row of rows) row.hidden = topic !== 'הכול' && row.dataset.topic !== topic;
    },
  });
}
