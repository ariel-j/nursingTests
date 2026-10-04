# Writing quizzes

This is the spec for producing quiz files, for any subject. Quiz content is written outside this repo,
usually with Claude working from the course materials, and only the finished JSON is added here.
Starting a whole new subject? Read [new-subject.md](new-subject.md) first.

The block below is a brief you can paste into the session that writes the questions. Fill in the
three `<…>` values at the top and paste the subject's notes from the end of this file under it.
The exact JSON format and field rules are in [README.md](../README.md#quiz-format). `npm run validate` enforces them.

## Brief to paste

```text
You are writing multiple-choice quiz files for a Hebrew nursing exam-prep site.
SUBJECT: <subject name exactly as in the catalog, e.g. פרמקולוגיה>
UNIT:    <unit name exactly as in the catalog, e.g. תרופות לב וכלי דם; or "none" if the subject has no units>
QUIZ:    <title, e.g. מבחן 1; and the quiz id, e.g. pharma-cardio-1>

Work only from the course material I give you. Do not add facts that aren't in it. If something is
ambiguous or you are unsure, list it for me in chat. Never put it in the file.

OUTPUT
- One JSON file per quiz, UTF-8. Large quizzes are fine (200 questions is normal): students can
  practice a subset of topics, and a printable exam samples from it.
- File name = quiz id + ".json". The id is lowercase English with hyphens, and starts with a short
  subject prefix so ids never clash between subjects: "heart-1", "pharma-cardio-1".
- Format:
  {
    "id": "<quiz id>",
    "subject": "<SUBJECT, exactly>",
    "unit": "<UNIT, exactly; leave this field out when UNIT is none>",
    "title": "<QUIZ title, e.g. מבחן 1>",
    "description": "<one Hebrew sentence: what the quiz covers>",
    "questions": [
      {
        "id": "q001",
        "topic": "<one of this quiz's topics, exact string>",
        "question": "<Hebrew stem>",
        "options": [
          { "text": "<correct answer>", "note": "<optional>" },
          { "text": "<distractor>", "note": "<why this is wrong>" },
          { "text": "<distractor>", "note": "<why this is wrong>" },
          { "text": "<distractor>", "note": "<why this is wrong>" }
        ],
        "correct": 0,
        "explanation": "<Hebrew, 1–3 sentences: why the correct answer is correct>"
      }
    ]
  }
- No other fields anywhere. Unknown fields are rejected.
- "correct" is the index in the order you wrote the options. The site reshuffles options on every display,
  so you may always put the correct one first.

IDS
- Question ids: "q001", "q002", … unique within the file.
- Once a file has been delivered, never renumber. New questions get the next unused number.
  Deleted ids are never reused. Saved progress is tracked by these ids.

TOPICS
- Before writing questions, fix a list of topics for the quiz (about 5–15), each covering at least 3
  questions, and show it to me. Students pick topics to practice from this list, and the end screen
  and printable exam group by it.
- Use the exact same string every time. The end screen groups "weak topics" by exact match,
  so "הולכה חשמלית" and "ההולכה החשמלית" would count as two topics.
- Keep topic names short (2–4 words). In mixed practice they are shown as "<unit> · <topic>".

WRITING QUESTIONS
- Exactly one option is unambiguously correct according to the material.
- Distractors are plausible: same category as the answer (all hormones, all drugs of one class…),
  similar length and grammar. The correct answer must not stand out as the longest or most detailed.
- Options must make sense in any order. NEVER write options like "א+ב נכונות", "תשובה ג",
  "כל התשובות נכונות", "אף תשובה אינה נכונה", "all/none of the above". The validator rejects them.
- The stem stands on its own, with no references to other questions or to figures.
- For negative stems, make the negation obvious: "איזה מהבאים אינו…". Use them sparingly.
- Test understanding (mechanism, cause→effect, clinical relevance, what the nurse does), not only definitions.
- Mix difficulty: about a third recall, a third understanding, a third application (a short clinical case).
- Write original questions based on the material. Do not reproduce past exam questions
  or copy long passages. The repository is public.

NOTES AND EXPLANATIONS
- "explanation" (required): why the correct answer is right. It is shown after every answer and
  in the printable answer key, so it must make sense without seeing the options' order.
- "note" on each distractor (strongly recommended): the misconception behind it, i.e. why a student
  might pick it and why it is wrong. It is shown when the student chooses that option.
- A "note" on the correct option is optional. Add one only if it says something beyond the explanation.

STYLE OF THE TEXT
- Hebrew, plain and short. Stems are one or two sentences; options are a few words to one line.
- On first mention in a question, give medical terms with the English/Latin term in parentheses:
  "הקשר הסינוטריאלי (SA node)". Abbreviations in Latin letters as they are: ECG, ADH, ACE.
- Plain text only: no HTML, no Markdown (** does not render as bold). Use Unicode for symbols:
  O₂, CO₂, Na⁺, K⁺, Ca²⁺, H⁺, →, ↑, ↓, ≥, µ. Use \n for a line break if one is really needed.
- Numbers and units as in the material ("5 mg", "120/80 mmHg"); a range as "2–5".

BEFORE HANDING OVER, CHECK
- Valid JSON; every question has 4 options with distinct texts; "correct" is 0–3.
- "subject" and "unit" are exactly the strings given above.
- Every topic string comes from the agreed list.
- No positional options; no fields other than the documented ones.
- A separate list in chat of any question you are not fully sure about, with the reason.
```

## Notes per subject

Paste the block for the subject under the brief.

### אנטומיה ופיזיולוגיה

```text
SUBJECT NOTES
- Units are body systems. Aim questions at function and regulation (what drives each step and
  what changes as a result), not only at naming structures.
- Clinical links are welcome when the material makes them (e.g. what happens in heart failure).
```

### פרמקולוגיה

```text
SUBJECT NOTES
- Drug names: the generic name in English, in parentheses after the Hebrew class or description
  on first mention: "חוסם בטא (Propranolol)". Brand names only if the material uses them.
- Cover, for each drug or class in the material: mechanism of action, indications, main side
  effects, contraindications, important interactions, and nursing considerations (what to check
  before giving it, what to monitor after, what to teach the patient).
- Distractors from the same family: another drug of a related class, a side effect of a different
  class, a plausible but wrong mechanism. Never a made-up drug name.
- Doses, units and routes only exactly as they appear in the material; never invent or round a dose.
  Write units in Latin letters: mg, mcg, mL, IU, IV, IM, PO.
- Calculation questions (dose, drip rate) are welcome: put the numbers in the stem, the four options
  are results, and the explanation shows the calculation in one line.
- Topics are usually drug classes or body systems ("נוגדי קרישה", "משתנים"), plus cross-cutting ones
  such as "חישובי מינונים" or "עקרונות פרמקוקינטיקה".
```

## After receiving a file

1. Save it as `quizzes/<id>.json` (or convert it with `npm run import`, see README).
2. `npm run manifest && npm run validate`. Validation errors name the file, question id and field.
3. Play it locally with `npm run serve` before committing.
