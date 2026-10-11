// Text data for the coagulation summary's widgets (no DOM, no storage; checked by the Node tests). Strings use
// the markup of rich.js (**bold**, `Latin`, \n). The explorer's facts are also printed in the page's static
// text (a chapter of cards), so the page works without scripts and in all.html.
export { parseRich, isBalanced } from './rich.js';
export { studyProgress, toggleDone } from './study-progress.js';

// ---------- explorer ----------
// One entry per button: `lead` is the highlighted line, `boxes` the cards (a tone is optional), `pearl` the exam tip.

export const EXPLORER = [
  {
    "key": "platelets",
    "tone": "rose",
    "tag": "נוגדי טסיות",
    "title": "1. פקק הטסיות הראשוני (`Primary Hemostasis` / קריש לבן)",
    "lead": {
      "label": "⚡ תפקיד:",
      "text": "היווצרות פקק טסיות מהיר במקום הפגיעה באנדותל למניעת אובדן דם מיידי."
    },
    "boxes": [
      {
        "title": "🧬 מהלך התהליך",
        "tone": "",
        "text": "פגיעה באנדותל ← חשיפת קולגן ו-`vWF` ← אקטיבציה של טסיות ושחרור `TXA2` ו-`ADP` ← ביטוי קולטן `GP IIb/IIIa` ← צימות על ידי גישור פיברינוגן."
      },
      {
        "title": "💊 תרופות",
        "tone": "emerald",
        "text": "`Aspirin` (מעכב `COX-1`), `Clopidogrel` (חוסם `P2Y12`), `Dipyridamole` (מעכב `PDE`), `Abciximab` (חוסם `GP IIb/IIIa`)."
      },
      {
        "title": "🔬 ניטור",
        "tone": "amber",
        "text": "ספירת טסיות (`Platelet count`), זמן דימום (`Bleeding time`)."
      }
    ],
    "pearl": "קריש עורקי עשיר בטסיות (\"קריש לבן\") ולכן מגיב בצורה הטובה ביותר לנוגדי טסיות ולא לנוגדי קרישה."
  },
  {
    "key": "intrinsic",
    "tone": "blue",
    "tag": "`Heparin` ו-`aPTT`",
    "title": "2. המסלול האינטרינזי (הפנימי) והפרין (`UFH`)",
    "lead": {
      "label": "⚡ תפקיד:",
      "text": "מופעל במגע עם משטח זר / קולגן של כלי הדם; מערב פקטורים 12, 11, 9, 8."
    },
    "boxes": [
      {
        "title": "🧬 מהלך התהליך",
        "tone": "",
        "text": "שפעול פקטור 12 ← 11 ← 9 ← קומפלקס 9`a+8a` משפעל את פקטור 10 במסלול המשותף ← טרומבין ופיברין."
      },
      {
        "title": "💊 תרופות",
        "tone": "emerald",
        "text": "`Unfractionated Heparin` (`UFH`), `LMWH` (`Enoxaparin`), מעכבי טרומבין ישירים (`Argatroban`, `Bivalirudin`)."
      },
      {
        "title": "🔬 ניטור",
        "tone": "amber",
        "text": "`aPTT` (`Activated Partial Thromboplastin Time`). יעד טיפולי: פי 1.5–2.5 מהנורמה."
      }
    ],
    "pearl": "סם-הנגד הספציפי והמיידי להפרין הוא `Protamine Sulfate` (מתן `IV` איטי)."
  },
  {
    "key": "extrinsic",
    "tone": "amber",
    "tag": "`Warfarin` ו-`INR`",
    "title": "3. המסלול האקסטרינזי (החיצוני) ו-`Warfarin` (קומדין)",
    "lead": {
      "label": "⚡ תפקיד:",
      "text": "מופעל על ידי פקטור רקמתי (`Tissue Factor` / `Thromboplastin`) הנחשף בעת נזק לרקמה; מערב פקטור 7."
    },
    "boxes": [
      {
        "title": "🧬 מהלך התהליך",
        "tone": "",
        "text": "`Tissue Factor` נקשר לפקטור 7 ← שפעול פקטור 10 במסלול המשותף ← יצירת טרומבין ורשת פיברין."
      },
      {
        "title": "💊 תרופות",
        "tone": "emerald",
        "text": "`Warfarin` (מעכב סינתזת פקטורים 2, 7, 9, 10 ו-`Protein C/S` בכבד)."
      },
      {
        "title": "🔬 ניטור",
        "tone": "amber",
        "text": "`PT` (`Prothrombin Time`) ו-`INR`. יעד טיפולי: 2.0–3.0 (במסתם מכני 2.5–3.5)."
      }
    ],
    "pearl": "וורפרין פועל רק בכבד ואינו מעכב פקטורים קיימים; לכן הוא חסר כל השפעה על דם שנשאב במבחנה (`in vitro`)."
  },
  {
    "key": "fibrinolysis",
    "tone": "emerald",
    "tag": "`t-PA` ו-`Tranexamic acid`",
    "title": "4. פיברינוליזה (המסת הקריש) וטרומבוליטים",
    "lead": {
      "label": "⚡ תפקיד:",
      "text": "מערכת הבקרה הפיזיולוגית שמפרקת את רשת הפיברין לאחר תיקון כלי הדם כדי למנוע חסימה."
    },
    "boxes": [
      {
        "title": "🧬 מהלך התהליך",
        "tone": "",
        "text": "שחרור `t-PA` מהאנדותל ← שפעול פלסמינוגן לפלסמין ← פלסמין חותך וממיס את רשת הפיברין (תוצרי `D-dimer`)."
      },
      {
        "title": "💊 תרופות",
        "tone": "emerald",
        "text": "ממיסי קריש: `Alteplase`, `Tenecteplase` (`t-PA`). מעכבי פיברינוליזה לעצירת דימום: `Tranexamic Acid` (הקסקפרון)."
      },
      {
        "title": "🔬 ניטור",
        "tone": "amber",
        "text": "רמת פיברינוגן, `D-Dimer`, מעקב סימני דימום נוירולוגיים."
      }
    ],
    "pearl": "מנגנון הטרומבוליטים הוא שפעול פלסמין לפירוק קרישי דם קיימים. חלון ההזדמנויות בשבץ איסכמי הוא עד 4.5 שעות."
  }
];

// ---------- flashcards ----------
// Plain text (set with textContent), each with the "asked in past exams" badge.

export const FLASHCARDS = [
  {
    "q": "מהו היתרון המרכזי של Apixaban (Eliquis) על פני Warfarin (קומדין)?",
    "a": "פחות בדיקות דם / אין צורך כלל בניטור INR ובדיקות קרישה שגרתיות! (שאלת שחזור קלאסית). כמו כן יש פחות אינטראקציות עם מזון ותרופות ופחות דימומים מוחיים.",
    "repeats": "נשאל בשחזורים"
  },
  {
    "q": "מהו סם-הנגד (Antidote) המדויק למינון יתר של Warfarin, ומהו סם-הנגד להפרין?",
    "a": "לוורפרין: ויטמין K (ובדימום חמור FFP/PCC). להפרין: Protamine Sulfate. (מלכודת מבחן: פרוטמין אינו סם-נגד לוורפרין!).",
    "repeats": "נשאל בשחזורים"
  },
  {
    "q": "מדוע Warfarin חסר כל השפעה על קרישת דם במבחנה (in vitro)?",
    "a": "מכיוון שוורפרין אינו מעכב את פקטורי הקרישה שכבר קיימים בדם, אלא מעכב את הסינתזה שלהם בכבד בלבד על ידי עיכוב האנזים VKOR.",
    "repeats": "נשאל בשחזורים"
  },
  {
    "q": "איזו תרופה מהבאות אינה נוגדת טסיות: Aspirin, Clopidogrel, Abciximab, Warfarin?",
    "a": "Warfarin! וורפרין הוא נוגד קרישה (פועל על פקטורי קרישה חלבוניים), בעוד ששלושת האחרים הם נוגדי טסיות.",
    "repeats": "נשאל בשחזורים"
  },
  {
    "q": "מהו מנגנון הפעולה הפרמקולוגי של תרופות טרומבוליטיות / פיברינוליטיות (t-PA)?",
    "a": "שפעול פלסמינוגן (Plasminogen) לפלסמין פעיל (Plasmin), אשר חותך וממיס ישירות את רשת הפיברין של קריש דם שכבר נוצר.",
    "repeats": "נשאל בשחזורים"
  },
  {
    "q": "באיזה מינון משתמשים ב-Aspirin כנוגד טסיות למניעת אירועים לבביים ומוחיים?",
    "a": "במינון נמוך (75–100 מ\"ג ליום). במינון זה הוא מעכב סלקטיבית את TXA2 בטסיות ללא פגיעה משמעותית ב-PGI2 באנדותל.",
    "repeats": "נשאל בשחזורים"
  },
  {
    "q": "האם המשפט \"Enoxaparin (LMWH) דורש מעקב רציף של תפקודי קרישה\" נכון או שגוי?",
    "a": "שגוי בהחלט! LMWH מאופיין בפרמקוקינטיקה צפויה ואינו דורש ניטור שגרתי (בניגוד להפרין רגיל שדורש ניטור aPTT).",
    "repeats": "נשאל בשחזורים"
  },
  {
    "q": "האם המשפט \"בחולים שפיתחו תסמונת HIT אין תרופות חלופיות\" נכון או שגוי?",
    "a": "שגוי בהחלט! ישנן חלופות מצילות חיים: מעכבי טרומבין ישירים כגון Argatroban או Bivalirudin, וכן Fondaparinux.",
    "repeats": "נשאל בשחזורים"
  },
  {
    "q": "איזו תרופה נוגדת קרישה היא תרופת הבחירה הבלעדית בהריון, ומדוע קומדין אסור?",
    "a": "LMWH (כגון Enoxaparin) היא תרופת הבחירה בהריון כי אינה חוצה שליה. Warfarin חוצה שליה, טרטוגני וגורם למומים קשים ולדימומים עובריים.",
    "repeats": "נשאל בשחזורים"
  },
  {
    "q": "מדוע אסור לשלב Clopidogrel יחד עם Omeprazole (לוסק)?",
    "a": "קלופידוגרל הוא פרו-דראג הדורש שפעול כבדי על ידי CYP2C19. אומפרזול מעכב אנזים זה, מונע את הפעלת התרופה ומותיר את המטופל חשוף לאירועי לב.",
    "repeats": "נשאל בשחזורים"
  }
];
