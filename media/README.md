# media/: videos and artifacts

Short explainer videos, podcasts and your own artifacts, shown on `media.html?subject=<id>`
(the "סרטוני הסבר קצרים" card on a subject's page, and in the side menu). That page has a button per
sub-subject folder; each opens its own page, `media.html?subject=<id>&topic=<name>`, with that
topic's videos only.

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
  `_` reads as a space, and the number sets the order. Files directly in `pharmacology/` show on the
  subject's page, above the topic buttons.
- Every sub-subject folder needs its own name (`01 פרקינסון` and `פרקינסון` clash): the name is
  the topic's address, so renaming a folder changes its link.
- Supported: `mp4` / `webm` (H.264 mp4 plays everywhere), podcasts as `m4a` / `mp3` (audio player, no captions needed, shown after the videos), `png` `jpg` `webp` `gif` `svg`, `pdf`, `html`.
- Up to 50MB per file. GitHub's web upload stops at 25MB anyway. For a few minutes of 720p that's plenty.
- Captions: a `.vtt` file with the same name as the video. You don't have to make it: when you upload
  a video without one, the "Deploy site" action transcribes it (about half the video's length),
  commits the `.vtt` and opens an issue "בדיקת כתוביות אוטומטיות" with the words worth checking by
  ear. Fix a word by editing the `.vtt` on github.com. A video without captions is not published.
- `terms.md` in a subject or topic folder: terms that help the transcription spell drug names and
  jargon right. Not published.
- Drafts: start a file or folder name with `_` (`_01 - הסבר.mp4`) and it stays here but is not listed
  or published, e.g. a video you are still working on. Remove the `_` to publish it.
  The repo is public, so a draft is still visible on github.com.
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
