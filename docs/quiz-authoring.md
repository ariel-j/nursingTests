# Writing quizzes

This is the spec for producing quiz files. Quiz content is written outside this repo, usually with Claude
working from the course materials, and only the finished JSON is added here.
The block below is written as a brief you can paste into that session.
The exact JSON format and field rules are in [README.md](../README.md#quiz-format). `npm run validate` enforces them.

## Brief to paste

```text
You are writing multiple-choice quiz files for a Hebrew nursing anatomy & physiology exam-prep site.
Work only from the course material I give you. Do not add facts that aren't in it. If something is
ambiguous or you are unsure, list it for me in chat. Never put it in the file.

OUTPUT
- One JSON file per exam or chapter, UTF-8. Large quizzes are fine: students can practice a subset of topics.
- File name = quiz id + ".json". The id is lowercase English with hyphens: "cardiovascular", "respiratory".
- "subject" is the course the quiz belongs to, e.g. "אנטומיה ופיזיולוגיה". Use exactly the same string
  for every quiz of that course: the site groups quizzes by it.
- Format:
  {
    "id": "cardiovascular",
    "subject": "<course name, same for all its quizzes>",
    "title": "<Hebrew title, e.g. מבחן 1: הלב>",
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
  questions, and show it to me. Students pick topics to practice from this list.
- Use the exact same string every time. The end screen groups "weak topics" by exact match,
  so "הולכה חשמלית" and "ההולכה החשמלית" would count as two topics.

WRITING QUESTIONS
- Exactly one option is unambiguously correct according to the material.
- Distractors are plausible: same category as the answer (all hormones, all vessels…),
  similar length and grammar. The correct answer must not stand out as the longest or most detailed.
- Options must make sense in any order. NEVER write options like "א+ב נכונות", "תשובה ג",
  "כל התשובות נכונות", "אף תשובה אינה נכונה", "all/none of the above". The validator rejects them.
- The stem stands on its own, with no references to other questions or to figures.
- For negative stems, make the negation obvious: "איזה מהבאים אינו…". Use them sparingly.
- Test understanding (function, cause→effect, clinical relevance), not only definitions.
- Write original questions based on the material. Do not reproduce past exam questions
  or copy long passages. The repository is public.

NOTES AND EXPLANATIONS
- "explanation" (required): why the correct answer is right. It is shown after every answer.
- "note" on each distractor (strongly recommended): the misconception behind it, i.e. why a student
  might pick it and why it is wrong. It is shown when the student chooses that option.
- A "note" on the correct option is optional. Add one only if it says something beyond the explanation.

TEXT
- Hebrew. On first mention, give medical terms with the English/Latin term in parentheses:
  "הקשר הסינוטריאלי (SA node)".
- Plain text only: no HTML, no Markdown (** does not render as bold). Use Unicode for symbols:
  O₂, CO₂, Na⁺, K⁺, Ca²⁺, H⁺, →, ↑, ↓, ≥, µ. Use \n for a line break if one is really needed.

BEFORE HANDING OVER, CHECK
- Valid JSON; every question has 4 options with distinct texts; "correct" is 0–3.
- Every topic string comes from the agreed list.
- No positional options; no fields other than the documented ones.
- A separate list in chat of any question you are not fully sure about, with the reason.
```

## After receiving a file

1. Save it as `quizzes/<id>.json`.
2. `npm run manifest && npm run validate`. Validation errors name the file, question id and field.
3. Play it locally with `npm run serve` before committing.
