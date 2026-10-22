// Videos and artifacts page (media.html), from media/manifest.json. Without ?subject= it lists the
// subjects that have media. ?subject=<id> shows the subject's loose files and a card per sub-subject
// (topic); ?subject=<id>&topic=<name> shows that topic alone: its videos first (native player,
// captions when a .vtt was uploaded, a note when not), then images, PDFs and HTML pages as cards.
import {
  findMediaTopic, findSubject, loadManifest, loadMedia, mediaCount, mediaTopicPath, subjectPaths,
} from './catalog.js';

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
  if (!item.captions) caption.append(el('p', 'meta', 'לסרטון הזה אין עדיין כתוביות'));
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

/** A topic's (or the loose files') items, headed by `itemHeading`. */
function renderItems(items, itemHeading) {
  const section = el('section', 'group media-group');
  const videos = items.filter((i) => i.kind === 'video');
  const others = items.filter((i) => i.kind !== 'video');
  section.append(...videos.map((v) => renderVideo(v, itemHeading)));
  if (others.length > 0) {
    const list = el('ul', 'quiz-list media-list');
    list.append(...others.map((i) => renderCard(i, itemHeading)));
    section.append(list);
  }
  return section;
}

/** "2 סרטונים · חומר עזר אחד" */
function countLabel(items) {
  const videos = items.filter((i) => i.kind === 'video').length;
  const others = items.length - videos;
  const parts = [];
  if (videos > 0) parts.push(videos === 1 ? 'סרטון אחד' : `${videos} סרטונים`);
  if (others > 0) parts.push(others === 1 ? 'חומר עזר אחד' : `${others} חומרי עזר`);
  return parts.join(' · ');
}

function renderTopicLinks(subjectId, topics) {
  const section = el('section', 'group media-group');
  section.append(el('h2', 'group-title', 'בחרו נושא'));
  const list = el('ul', 'quiz-list');
  list.append(...topics.map((t) => {
    const link = el('a', 'quiz-card');
    link.href = mediaTopicPath(subjectId, t.name);
    link.append(el('h3', 'card-title', t.name), el('p', 'meta', countLabel(t.items)));
    const li = el('li');
    li.append(link);
    return li;
  }));
  section.append(list);
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

  const paths = subjectPaths(subject.id);
  $('subject').textContent = subject.name;
  $('subject').hidden = false;
  const topicName = new URLSearchParams(location.search).get('topic');
  if (topicName !== null) {
    $('back-link').href = paths.media;
    $('back-link').textContent = '→ כל הנושאים';
    const topic = findMediaTopic(data, subject.id, topicName);
    if (!topic) {
      status('הנושא הזה לא נמצא, אולי שמו השתנה. אפשר לבחור נושא מהרשימה.');
      return;
    }
    document.title = `${topic.name} · סרטוני הסבר קצרים · ${subject.name}`;
    $('subject').textContent = `${subject.name} · סרטוני הסבר קצרים`;
    $('page-title').textContent = topic.name;
    $('lede').hidden = true;
    $('media-groups').replaceChildren(renderItems(topic.items, 'h2'));
    return;
  }

  document.title = `סרטוני הסבר קצרים · ${subject.name}`;
  $('back-link').href = paths.home;
  $('back-link').textContent = `→ ${subject.name}`;
  const groups = data.subjects?.[subject.id]?.groups ?? [];
  if (groups.length === 0) {
    status('עדיין אין סרטונים במקצוע הזה.');
    return;
  }
  const loose = groups.find((g) => g.name === '');
  const topics = groups.filter((g) => g.name !== '');
  $('media-groups').replaceChildren(
    ...(loose ? [renderItems(loose.items, 'h2')] : []),
    ...(topics.length > 0 ? [renderTopicLinks(subject.id, topics)] : []),
  );
}

main();
