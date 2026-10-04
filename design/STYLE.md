# Site style: "feedback loop"

`reference.html` is the working endocrine quiz whose look the whole site should adopt.
Open it in a browser to see the target. Keep the site's engine (`js/core.js`) and data
format as they are: this is a visual change only.

## Tokens (put them on `:root` in the site stylesheet)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F1EFF4` | `#16141C` | page background, option background |
| `--surface` | `#FFFFFF` | `#211E29` | cards |
| `--ink` | `#1E1B2B` | `#EDEAF3` | text |
| `--muted` | `#5E5A6E` | `#A7A2B5` | secondary text, hints |
| `--line` | `#DAD5E1` | `#38334A` | borders, dividers |
| `--accent` | `#6B2F63` | `#D48CC6` | primary buttons, topic chip text, focus ring |
| `--accent-soft` | `#F1E4EF` | `#3A2536` | topic chip background |
| `--loop` | `#2E6E6A` | `#6FC2BB` | progress ring, big score number |
| `--loop-track` | `#D9E6E4` | `#253836` | ring track, bar track |
| `--ok` / `--ok-soft` | `#1F7A4D` / `#E3F3EA` | `#5FC98F` / `#173226` | correct answer |
| `--bad` / `--bad-soft` | `#B3261E` / `#FBE7E5` | `#F08A80` / `#3B1D1B` | wrong answer |

Dark mode: redefine under `@media (prefers-color-scheme: dark)` guarded by
`:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`.

## Type

- Google Fonts: `Frank Ruhl Libre` 500/700 and `Rubik` 400/500/600.
- Rubik for all UI (17px body, line-height 1.55).
- Frank Ruhl Libre only for page titles (24px/700) and the question stem (22px/500, 20px under 480px).

## Components (class names are from reference.html; map them to the site's own)

- **Progress ring** (the one signature element): 84px SVG circle, 8px stroke,
  `--loop` on `--loop-track`, rounded cap, starts at 12 o'clock. Center shows mastered
  count (22px/600) over "מתוך N" (12px muted). Next to it: quiz title, then
  "בתור: X   נכון בניסיון ראשון: Y/Z". Replaces any existing progress bar on the quiz page.
- **Card**: `--surface`, 1px `--line` border, radius 14px, padding 20px. No shadows.
- **Topic chip**: 13px, `--accent` on `--accent-soft`, pill. "שאלה חוזרת" in muted text beside it when a question reappears.
- **Option button**: full width, `--bg` fill, 1.5px `--line` border, radius 10px. Letter badge
  א/ב/ג/ד in a 26px circle. Hover: border `--accent`. Correct: `--ok` border + `--ok-soft`
  fill + filled badge. Chosen wrong: same with `--bad`. Other options: opacity .55.
- **Feedback box**: correct = `--ok-soft` with bold "נכון!" (auto-advance ~1.1s);
  wrong = `--bad-soft`, heading in `--bad`, explanation (and the option note, if any) in `--ink`.
- **Buttons**: primary = `--accent` fill; ghost = transparent with `--accent` border and text.
  Radius 10px, weight 600. Order in the action row: "דילוג" (ghost) at the start, "הבאה" (primary) at the end.
- **End screen**: first-attempt % as a 44px `--loop` number; weak topics as a list with a thin
  `--bad` bar on `--loop-track`; list of multi-attempt questions; "לתרגל שוב רק את השאלות האלה".
- **Home page**: quiz list as cards in the same style; weak topics use the same bar.

## Rules

- RTL throughout, `dir="rtl"` on `<html>`.
- Visible focus: 3px `--accent` outline, 2px offset.
- Motion only on the ring fill, and only under `prefers-reduced-motion: no-preference`.
- Keep the safe-area padding and `viewport-fit=cover` from reference.html.
