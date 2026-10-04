# Adding a subject

Every subject gets the same features, with no code changes. All of it comes from
`quizzes/subjects.json`, the quiz files and `js/summary-list.js`:

| Feature | Where | Appears when |
| --- | --- | --- |
| Subject card on the home page, and its entry in the side menu | `./`, menu | always (with "בחנים בקרוב" until it has quizzes) |
| Subject page: quizzes grouped by unit, each with its in-progress bar and best score | `./?subject=<id>` | always; empty units show "בקרוב" |
| Mixed practice across units ("בחירת נושאים למבחן") | `quiz.html?subject=<id>` | quizzes in two or more units |
| Printable exam for the whole subject, or for one quiz from its start screen | `print.html?subject=<id>` | at least one quiz |
| Summaries hub for the subject, and one combined PDF | `summaries/?subject=<id>` | at least one summary |

## 1. Declare it (in this repo)

Add the subject to `quizzes/subjects.json`, in the order it should appear (the units here are only an example):

```json
{ "id": "pharmacology", "name": "פרמקולוגיה", "units": ["עקרונות", "מערכת העצבים האוטונומית", "לב וכלי דם"] }
```

- `id`: lowercase English with hyphens. It goes in links and ties summaries to the subject, so
  don't change it later.
- `name`: the Hebrew name. Every quiz's `subject` must match it exactly. Mixed-practice progress is
  saved under it, so renaming it later restarts that progress.
- `units`: optional, in display order. Once a subject has units, every quiz needs one of them as `unit`.
  A subject without units lists its quizzes directly. Choose before the first quiz arrives.

Then `npm run manifest && npm run validate`.

## 2. Generate the quizzes (in the session that has the course material)

Paste the brief from [quiz-authoring.md](quiz-authoring.md#brief-to-paste) and fill in subject, unit and
quiz id. Under it, paste the subject's notes from the end of that file. If the subject has none yet,
add a block there first: how drug names, units, cases and so on are written for this subject.

Suggested size: one quiz per unit, 100–200 questions, 8–15 topics. A second quiz on the same unit
("מבחן 2") is the place for a different angle or level, such as cases or exam-recall style. A last unit
"מבחנים מסכמים" with a quiz over everything works well before the exam.

Quiz ids should start with the subject prefix (`pharma-…`) so they never clash with another subject.

## 3. Generate the summaries (optional, same session)

Paste the brief from [summary-authoring.md](summary-authoring.md#brief-to-paste), one summary per unit
or topic. It defines the page's visual style: cause → effect rows, definitions, traps, checklist.

## 4. Add the files (in this repo)

1. Quizzes: save as `quizzes/<id>.json`, or convert the authoring format with
   `npm run import -- <src.json> --id <id> --subject "<name>" --unit "<unit>" --title "<title>"`.
2. Summaries: follow the steps at the end of [summary-authoring.md](summary-authoring.md#after-receiving-an-article).
3. `npm run manifest && npm test && npm run validate`, then check it with `npm run serve`:
   the home card, the subject page, the menu, one quiz, mixed practice, the print preview, and a summary.
4. Commit the catalog, quizzes, manifest and summaries together.
