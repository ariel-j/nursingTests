# Adding a summary (including converting an interactive page)

Summaries are the owner's own short study pages in `summaries/`. They are often drafted elsewhere as a
standalone HTML page (Tailwind from a CDN, Google Fonts, inline scripts). That draft can't be committed as is:
convert it with these rules. `npm run validate` and `npm test` enforce the mechanical ones.

## 1. Before converting

- Read the whole draft first and list its parts: static text, and each interactive widget (calculator,
  canvas, search, flashcards, toggles). Everything on that list must exist in the result, or be reported to the
  owner as dropped, with the reason.
- Note facts that contradict the page's own teaching (for example a chart that shows the opposite of its text).
  Ask the owner before changing content; never "fix" silently, never copy a known error silently.
- Names of lecturers and course materials stay out (the repo is public).

## 2. Site rules the draft must meet

- No external requests: no CDN scripts, no Google Fonts, no remote images. Use `css/style.css` fonts.
- No Tailwind: rebuild the look with the site's tokens and the classes in `css/summary.css`
  (`rel`, `def`, `call`, `flags`, `exam`, `cards`, `pcard`, `tag`, `rtable`, `data-tone`).
- No inline `style=` or `on*=` attributes in HTML. Set styles from JS only (`el.style.x`) or via classes.
- Text via `textContent` and DOM/SVG APIs, never `innerHTML`. If a string needs bold, build the nodes.
- CSS logical properties only (inline/block, start/end); `lang="he" dir="rtl"`; Latin terms in `class="en"`.
- Colors must work in light, dark (`prefers-color-scheme`), high contrast (`data-contrast="high"`) and print
  (always light). Prefer `light-dark()` tokens (see `data-tone` in `summary.css`).
- A page-level theme toggle is not needed: the site follows the system theme and the accessibility toolbar.

## 3. Structure

1. `summaries/<id>.html` copies an existing page: one `<article class="summary" data-system="<id>">`, the
   print button (`data-print`), `../js/a11y.js`, and the footer links to the accessibility and privacy pages.
2. Add `{ id, title, blurb }` to `js/summary-list.js` and a `[data-system="<id>"]` accent in `css/summary.css`.
3. The article's text must be complete without JavaScript. Interactive blocks get `data-interactive` and
   `no-print`; `summaries/all.html` removes them, so the combined PDF is text only. If a widget carries a fact
   (a formula, a rule), that fact must also appear in static text outside the widget.
4. Widget code goes in its own files, loaded only by that page: `js/<id>.js` (DOM), `css/<id>.css`, and the
   logic in a pure module (`js/<id>-math.js`, no DOM or storage) with text data in `js/<id>-data.js`.

## 4. Interactive widgets

- Buttons that toggle use `aria-pressed`; live results use `<output>` or `role="status"`/`aria-live="polite"`.
- Every `<canvas>` has `role="img"` and an `aria-label` that is updated with the current state (values, mode).
- Anything clickable is a real `<button>` (flashcards included); hide the inactive face with `aria-hidden`.
- Redraw canvases with `ResizeObserver`, scale for `devicePixelRatio`, and keep labels inside the plot area
  (leave enough left padding for Hebrew labels).
- Filters and search must not hide content in print: clear them on `beforeprint`, restore on `afterprint`.
- Motion must respect "stop motion" (`data-motion="off"` kills transitions in `style.css`) and reduced motion.

## 5. Tests and checks before committing

- Unit-test the pure module: key values (EC50 gives 50%), invariants (a competitive antagonist keeps Emax),
  thresholds (band edges), and that data (flashcards) is complete and unique.
- `npm test`, `npm run validate`.
- Open the page with `npm run serve` and check: every widget, keyboard only, dark mode, high contrast, a
  390px-wide phone (no horizontal scroll), `all.html` (no widgets, no errors in the console), and print preview.
- Update `accessibility.html` (and its date) when the page adds new interactive features.
- Update README.md and CLAUDE.md if the pattern itself changed.
