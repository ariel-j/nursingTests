// Video page (video.html?id=<id>): the browser's own player with native controls, optional Hebrew captions,
// and a remembered position. The file names come from the validated metadata (always <id>.mp4 / <id>.vtt).
import { isValidQuizId } from './core.js';
import { formatClock, formatDuration, resumePosition, validateVideo } from './video-core.js';
import { keys, load, remove, save } from './storage.js';

const $ = (id) => document.getElementById(id);
const ui = {
  subject: $('subject'), title: $('video-title'), status: $('status'), watch: $('watch'),
  description: $('description'), player: $('player'), fallback: $('fallback-link'),
  resumeNote: $('resume-note'), info: $('info'),
};

let video = null;
let lastSaved = 0;

function showStatus(text) {
  ui.status.textContent = text;
  ui.status.hidden = false;
  ui.watch.hidden = true;
}

function savePosition() {
  const t = ui.player.currentTime;
  if (!Number.isFinite(t)) return;
  if (ui.player.ended) remove(keys.videoPosition(video.id));
  else save(keys.videoPosition(video.id), { t: Math.floor(t), d: Math.floor(ui.player.duration) || null });
}

function offerResume() {
  const t = resumePosition(load(keys.videoPosition(video.id)), ui.player.duration);
  if (t === 0) return;
  ui.player.currentTime = t;
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.className = 'chip';
  restart.textContent = 'התחל מההתחלה';
  restart.addEventListener('click', () => {
    ui.player.currentTime = 0;
    remove(keys.videoPosition(video.id));
    ui.resumeNote.hidden = true;
    ui.player.focus();
  });
  ui.resumeNote.replaceChildren(document.createTextNode(`ממשיכים מהמקום שעצרתם: ${formatClock(t)}. `), restart);
  ui.resumeNote.hidden = false;
}

async function main() {
  const id = new URLSearchParams(location.search).get('id');
  if (!isValidQuizId(id)) {
    showStatus('לא נבחר סרטון.');
    return;
  }
  try {
    const res = await fetch(`videos/${id}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    video = await res.json();
  } catch (err) {
    console.error(err);
    showStatus(location.protocol === 'file:'
      ? 'יש להריץ דרך שרת (npm run serve), הדפדפן חוסם טעינה מקובץ מקומי.'
      : 'לא הצלחנו לטעון את הסרטון.');
    return;
  }
  const errors = validateVideo(video);
  if (errors.length > 0 || video.id !== id) {
    console.error('Invalid video file:', errors);
    showStatus('קובץ הסרטון פגום. פרטים בקונסול.');
    return;
  }

  const place = video.unit ? `${video.subject} · ${video.unit}` : video.subject;
  document.title = `${video.title} · ${place}`;
  ui.subject.textContent = `סרטון · ${place}`;
  ui.title.textContent = video.title;
  ui.description.textContent = video.description ?? '';
  ui.description.hidden = !video.description;

  const src = `videos/${video.file}`;
  ui.fallback.href = src;
  ui.player.setAttribute('aria-label', video.title);
  ui.player.src = src;
  if (video.captions) {
    const track = document.createElement('track');
    track.kind = 'captions';
    track.srclang = 'he';
    track.label = 'עברית';
    track.src = `videos/${video.captions}`;
    ui.player.append(track);
  }

  const bits = [];
  if (video.durationSec) bits.push(formatDuration(video.durationSec));
  bits.push(video.captions
    ? 'יש כתוביות בעברית: הפעילו אותן בכפתור הכתוביות (CC) בנגן.'
    : 'אין כתוביות לסרטון הזה.');
  ui.info.textContent = bits.join(' · ');

  ui.player.addEventListener('loadedmetadata', offerResume, { once: true });
  ui.player.addEventListener('timeupdate', () => {
    if (Date.now() - lastSaved > 5000) {
      lastSaved = Date.now();
      savePosition();
    }
  });
  ui.player.addEventListener('pause', savePosition);
  ui.player.addEventListener('ended', savePosition);
  window.addEventListener('pagehide', savePosition);
  ui.player.addEventListener('error', () => {
    ui.info.textContent = 'לא הצלחנו להפעיל את הסרטון. אפשר להוריד אותו ולצפות במכשיר.';
  });

  ui.status.hidden = true;
  ui.watch.hidden = false;
}

main();
