# Adding videos

A video is three files in `videos/` that share one id: `<id>.mp4`, `<id>.json` and an optional `<id>.vtt` (captions).
The easy way is the admin panel (tab "סרטונים"): choose the mp4, optionally the captions, fill in the id, title and
place, preview, publish. The format and rules are in [README.md](../README.md#videos-סרטונים); `npm run validate` and the
panel enforce them. Examples: [`templates/video.json`](../templates/video.json), [`templates/captions.vtt`](../templates/captions.vtt).

## Prepare the video

The panel accepts mp4 files up to 50 MB, and every video stays in git history forever (even after you delete it), so
compress before uploading. H.264 video with AAC audio plays in every browser. With `ffmpeg`:

```text
ffmpeg -i original.mov -vf "scale=-2:720" -c:v libx264 -crf 28 -preset slow -c:a aac -b:a 96k -movflags +faststart video.mp4
```

- `scale=-2:720` makes it 720p (use 480 for lecture slides that are mostly text).
- Higher `-crf` = smaller file, lower quality (23 good, 28 small, 32 very small).
- `-movflags +faststart` puts the index at the start of the file so the video starts and seeks quickly. The panel reads
  the duration from that index.
- Rough size: 10 minutes at 720p/crf 28 is about 10-15 MB.

Larger than 50 MB: add `videos/<id>.mp4` and `videos/<id>.json` with git, then `npm run manifest` and `npm run validate`.

## Captions (Hebrew)

Captions are a WebVTT file: the first line is `WEBVTT`, then cues of `start --> end` and the text.

```text
WEBVTT

00:00.000 --> 00:03.000
שורת כתובית ראשונה

00:03.000 --> 00:06.500
שורת כתובית שנייה
```

- Keep each cue to one or two short lines, shown for at least a second or two.
- Generate them with any transcription tool and **read them through** before publishing: Hebrew medical terms are often
  transcribed wrongly.
- Add them later at any time: panel, tab "סרטונים", "עריכה" on the video, "כתוביות".
- A video without captions works, and the page says "אין כתוביות לסרטון הזה". The accessibility statement lists the
  videos without captions as a known limitation until they are added.

## Deleting

Deleting a video in the panel removes the mp4, the details and the captions from the site in one commit. The old
bytes remain in the repository's git history, so the repository does not get smaller. Rewriting history to purge a file
is possible but destructive; do it only deliberately.
