# media/: videos and artifacts

Short explainer videos and your own artifacts, shown on `media.html?subject=<id>`
(the "סרטוני הסבר קצרים" card on a subject's page, and in the side menu).

## Layout

```
media/
  pharmacology/                 ← the subject id from quizzes/subjects.json
    01 - נוגדי קרישה/            ← one folder per sub-subject (optional)
      01 - הסבר.mp4
      01 - הסבר.vtt             ← captions for the video above (same name)
      02 - מנגנון פעולה.png
      03 - טבלת תרופות.pdf
      04 - תרגול.html
```

- Titles come from the names: the extension and an ordering prefix (`01 - `, `2_`, `3.`) are dropped,
  and the number sets the order. Files directly in `pharmacology/` show first, without a heading.
- Supported: `mp4` / `webm` (H.264 mp4 plays everywhere), `png` `jpg` `webp` `gif` `svg`, `pdf`, `html`.
- Up to 50MB per file. GitHub's web upload stops at 25MB anyway. For a few minutes of 720p that's plenty.
- Captions: a `.vtt` file with the same name as the video. Videos without captions are listed as a
  warning, and the accessibility statement says so.
- HTML pages open in a new tab. If one loads scripts from the internet (a CDN), validation warns.
- **The repo is public.** Only your own material: no pptx, lecture recordings, slides or textbook scans.
  `.pptx` / `.docx` are rejected.

## Uploading on GitHub

1. Open the `media/pharmacology` folder on github.com → **Add file → Upload files**.
   To create a sub-subject folder, drag the whole folder from your computer into the upload box.
2. Commit to `main`.
3. The "Deploy site" action builds the list of files and publishes the site (about a minute).
   If a file breaks a rule, it is left out, the action fails and GitHub emails you; the reason is in its log.

Locally instead: copy the files here, `npm run manifest && npm run validate`, check with `npm run serve`, commit and push.
