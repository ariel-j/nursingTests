// Videos and artifacts page (media.html). ?subject=<id> shows that subject's media/manifest.json
// entries: one section per sub-subject folder, its videos first (native player, captions when a .vtt
// was uploaded), then images, PDFs and HTML pages as cards. Without ?subject= it lists the subjects
// that have media.
import { findSubject, loadManifest, loadMedia, mediaCount, subjectPaths } from './catalog.js';

const $ = (id) => document.getElementById(id);
const KIND_LABEL = { image: 'תמונה', pdf: 'PDF', html: 'עמוד אינטראקטיבי' };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Manifest paths keep the file names as uploaded (Hebrew, spaces); encode each segment for a URL. */
const url = (src) => src.split('/').map(encodeURIComponent).join('/');

function status(text) {
  $('status').textContent = text;
  $('status').hidden = false;
}

function renderVideo(item, headingTag) {
  const figure = el('figure', 'media-video');
  const video = el('video');
  video.controls = true;
  video.preload = 'metadata';
  video.playsInline = true;
  video.src = url(item.src);
  video.setAttribute('aria-label', item.title);
  if (item.captions) {
    const track = el('track');
    track.kind = 'captions';
    track.srclang = 'he';
    track.label = 'עברית';
    track.src = url(item.captions);
    track.default = true;
    video.append(track);
  }
  const fallback = el('a', null, 'הדפדפן לא מנגן את הסרטון. להורדה');
  fallback.href = url(item.src);
  video.append(fallback);
  const caption = el('figcaption');
  caption.append(el(headingTag, 'card-title', item.title));
  figure.append(video, caption);
  return figure;
}

function renderCard(item, headingTag) {
  const link = el('a', `quiz-card media-card is-${item.kind}`);
  link.href = url(item.src);
  link.target = '_blank';
  link.rel = 'noopener';
  if (item.kind === 'image') {
    const img = el('img');
    img.src = url(item.src);
    img.alt = item.title;
    img.loading = 'lazy';
    link.append(img);
  }
  link.append(el(headingTag, 'card-title', item.title),
    el('p', 'meta', `${KIND_LABEL[item.kind]} · נפתח בלשונית חדשה`));
  const li = el('li');
  li.append(link);
  return li;
}

function renderGroup(group, index) {
  const section = el('section', 'group media-group');
  section.id = `part-${index + 1}`;
  const itemHeading = group.name ? 'h3' : 'h2';
  if (group.name) section.append(el('h2', 'group-title', group.name));
  const videos = group.items.filter((i) => i.kind === 'video');
  const others = group.items.filter((i) => i.kind !== 'video');
  section.append(...videos.map((v) => renderVideo(v, itemHeading)));
  if (others.length > 0) {
    const list = el('ul', 'quiz-list media-list');
    list.append(...others.map((i) => renderCard(i, itemHeading)));
    section.append(list);
  }
  return section;
}

function renderSubjectLinks(subjects, media) {
  const list = el('ul', 'quiz-list');
  list.append(...subjects.map((s) => {
    const link = el('a', 'quiz-card');
    link.href = subjectPaths(s.id).media;
    link.append(el('h2', 'card-title', s.name), el('p', 'meta', `${mediaCount(media, s.id)} פריטים`));
    const li = el('li');
    li.append(link);
    return li;
  }));
  return list;
}

async function main() {
  const media = loadMedia();
  let manifest;
  try {
    manifest = await loadManifest();
  } catch (err) {
    console.error(err);
    status(location.protocol === 'file:'
      ? 'יש להריץ דרך שרת (npm run serve), הדפדפן חוסם טעינה מקובץ מקומי.'
      : 'לא הצלחנו לטעון את רשימת המקצועות.');
    return;
  }
  const data = await media;
  $('status').hidden = true;

  const subject = findSubject(manifest, new URLSearchParams(location.search).get('subject'));
  if (!subject) {
    const withMedia = (manifest.subjects ?? []).filter((s) => mediaCount(data, s.id) > 0);
    if (withMedia.length === 0) status('עדיין אין סרטונים.');
    else $('media-groups').replaceChildren(renderSubjectLinks(withMedia, data));
    return;
  }

  document.title = `סרטוני הסבר קצרים · ${subject.name}`;
  $('subject').textContent = subject.name;
  $('subject').hidden = false;
  $('back-link').href = subjectPaths(subject.id).home;
  $('back-link').textContent = `→ ${subject.name}`;
  const groups = data.subjects?.[subject.id]?.groups ?? [];
  if (groups.length === 0) {
    status('עדיין אין סרטונים במקצוע הזה.');
    return;
  }
  $('media-groups').replaceChildren(...groups.map(renderGroup));
}

main();
