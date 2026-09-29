# Nursing exam practice quizzes

A Hebrew (RTL) quiz site for nursing exam prep, grouped by subject, served as static files from GitHub Pages:
https://ariel-j.github.io/nursingTests/

No build step and no runtime dependencies. Node is only needed for the tests and scripts.

## How a quiz plays

- The home page lists quizzes grouped by subject. Each quiz opens on a start screen where you resume
  an unfinished session, or start a new one over all topics or only the ones you tick.
- Questions are shown in random order. The 4 options are reshuffled every time a question is shown.
- A **wrong** or **skipped** question goes back into the queue and comes back 2–5 questions later,
  never immediately next. The one exception is when it is the only question left.
- A question answered correctly on the **first try** is mastered.
  A question that was missed or skipped needs **2 correct answers in a row** to be mastered.
  Each of those correct answers requeues it the same way.
- After a wrong answer you see your choice in red, the correct answer in green, the explanation,
  and the note written for the option you chose.
- Progress shows mastered/total and the queue size. The end screen shows the first-try score,
  the questions that came back, and weak topics.
- The end screen can start a session with only the questions that came back.
- An unfinished session is saved in `localStorage` and resumes after a refresh.
  The quiz list shows which quizzes are in progress and your best first-try score
  (best score counts only runs over the whole quiz).
- Keyboard: `1`–`4` choose, `S` skips, `Enter` continues. These use key codes, so they also work with a Hebrew layout.

## Adding a quiz

Writing guidelines, plus a brief you can paste into the session that writes the questions, are in
[docs/quiz-authoring.md](docs/quiz-authoring.md).

1. Make sure the quiz's `subject` (and `unit`, if that subject has units) exist in
   `quizzes/subjects.json`. Add them there first if needed.
2. Save the quiz as `quizzes/<id>.json`. The file name must match `id`. If you were given the quiz in
   the authoring format (options as plain strings + `correctIndex` + `wrongExplanations`), convert it:
   `npm run import -- <src.json> --id <id> --subject "<subject>" --unit "<unit>" --title "<title>"`.
3. `npm run manifest` to regenerate `quizzes/manifest.json`.
4. `npm run validate` to check everything.
5. Commit the quiz, the catalog and the manifest together.

`quizzes/subjects.json` is the hand-written catalog: an ordered list of subjects, each with an optional
ordered list of units. It sets the sections and their order on the home page; empty units show as "בקרוב".

### Quiz format

```json
{
  "id": "cardio-basics",
  "subject": "אנטומיה ופיזיולוגיה",
  "unit": "הלב",
  "title": "מבחן 1",
  "description": "optional, shown on the quiz list",
  "questions": [
    {
      "id": "q1",
      "topic": "הולכה חשמלית",
      "question": "היכן נוצר הדחף החשמלי בלב תקין?",
      "options": [
        { "text": "בקשר הסינוטריאלי (SA)", "note": "optional note for this option" },
        { "text": "בקשר האטריו־ונטריקולרי (AV)", "note": "why this is wrong" },
        { "text": "בצרור ע״ש היס" },
        { "text": "בסיבי פורקינייה" }
      ],
      "correct": 0,
      "explanation": "shown after every answer"
    }
  ]
}
```

| Field | Rules |
| --- | --- |
| `id` | lowercase letters, digits and single hyphens (`cardio-basics`) |
| `subject` | required. Must exist in `quizzes/subjects.json`; sets the home-page section |
| `unit` | required when the subject declares units, and must be one of them; sets the sub-section |
| `title` | required. Sorted with numbers in order, so "מבחן 2" comes before "מבחן 10" |
| `description` | optional string |
| `questions[].id` | required, unique within the quiz. Keep it stable: saved progress is keyed by it |
| `questions[].topic` | required. Used to group weak topics on the end screen |
| `questions[].question` | required |
| `questions[].options` | exactly 4, texts must be distinct |
| `options[].text` | required |
| `options[].note` | optional. Shown when that option is chosen |
| `questions[].correct` | index 0–3 into `options` **as written**. The engine shuffles, so authors don't have to |
| `questions[].explanation` | required |

Unknown fields are rejected, which catches typos like `explenation`. Options that refer to other options
by position ("א+ב נכונות", "all of the above") are rejected too, because the options are shuffled.
All text is rendered as plain text (no HTML). Use Unicode for symbols (O₂, Na⁺, →).
A `\n` in a string becomes a line break.

If you add, remove or rename question IDs in a quiz, saved progress for that quiz no longer matches.
It is dropped, and the quiz starts fresh.

## Development

```sh
npm test          # unit tests for js/core.js and the scripts (node:test)
npm run validate  # validate all quizzes and check the manifest is current
npm run manifest  # regenerate quizzes/manifest.json
npm run serve     # http://localhost:8000 (fetch() does not work over file://)
```

| Path | Role |
| --- | --- |
| `js/core.js` | pure logic: queue, scoring, stats, validation. No DOM, no storage |
| `js/ecg.js` | pure SVG path for the ECG progress strip |
| `js/storage.js` | guarded `localStorage` wrapper (prefix `anatomy-quizzes:v1:`) |
| `js/index.js`, `js/quiz.js` | page UI |
| `scripts/` | manifest, validate, and a tiny static dev server |
| `fonts/` | self-hosted Assistant and Frank Ruhl Libre (SIL OFL, licenses included) |
| `test/` | unit tests. `test/fixtures/` holds placeholder content only |
