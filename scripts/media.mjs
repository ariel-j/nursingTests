// Videos and the owner's own artifacts (images, PDFs, HTML pages) under media/<subject-id>/,
// optionally one folder deeper per sub-subject. GitHub Pages can't list a folder, so this scans
// media/ into media/manifest.json, which the media page reads. The file is not committed: the Pages
// deploy workflow builds it on every deploy, and `npm run manifest` builds it for local use.
// buildMedia is pure, so the tests feed it a file list.
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mediaCount } from '../js/catalog.js';

export const MEDIA_DIR = fileURLToPath(new URL('../media/', import.meta.url));
export const MEDIA_MANIFEST = 'manifest.json';
// GitHub warns at 50MB per file (and its web upload stops at 25MB); keeps the Pages site small.
export const MAX_BYTES = 50 * 1024 * 1024;

const KINDS = {
  mp4: 'video', webm: 'video',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', svg: 'image',
  pdf: 'pdf',
  html: 'html', htm: 'html',
};
const COURSE_FILES = new Set(['ppt', 'pptx', 'doc', 'docx', 'key']);
const CONVERT_VIDEO = new Set(['mov', 'mkv', 'avi', 'wmv', 'm4v']);

const collator = new Intl.Collator('he', { numeric: true });
const extOf = (name) => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '');
const stem = (name) => (name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name);

/** Display name of a file (no extension) or folder: no ordering prefix ("01 - ", "2_", "3.", "4)"). */
export function displayName(name, { isFile = true } = {}) {
  const base = isFile ? stem(name) : name;
  return base.replace(/^\d+\s*[-_.)]?\s*/, '').trim() || base.trim();
}

/** Files that are not media: notes, the manifest itself, dotfiles (.gitkeep, .DS_Store). */
function ignored(rel) {
  const base = rel.split('/').pop();
  return base.startsWith('.') || extOf(base) === 'md' || rel === MEDIA_MANIFEST;
}

/**
 * The manifest from a file list. `files` are { path, size } with paths relative to media/ and '/'
 * separators; `subjectIds` are the catalog's ids. Returns { manifest, errors, warnings }: files with
 * errors are left out of the manifest, warnings (a video with no captions) are not.
 */
export function buildMedia(files, subjectIds) {
  const errors = [];
  const warnings = [];
  const bySubject = new Map(); // id → Map(group folder → item[])
  const captions = new Set(files.map((f) => f.path).filter((p) => extOf(p) === 'vtt'));
  const usedCaptions = new Set();

  for (const { path: rel, size } of files) {
    if (ignored(rel)) continue;
    const where = `media/${rel}`;
    const parts = rel.split('/');
    const ext = extOf(rel);
    if (parts.length < 2 || parts.length > 3) {
      errors.push(`${where}: put files in media/<subject-id>/ or media/<subject-id>/<sub-subject>/`);
      continue;
    }
    const [subject] = parts;
    if (!subjectIds.includes(subject)) {
      errors.push(`${where}: "${subject}" is not a subject id in quizzes/subjects.json (${subjectIds.join(', ')})`);
      continue;
    }
    if (ext === 'vtt') continue; // paired with its video below
    if (COURSE_FILES.has(ext)) {
      errors.push(`${where}: course files (.${ext}) are not published, the repo is public`);
      continue;
    }
    if (CONVERT_VIDEO.has(ext)) {
      errors.push(`${where}: browsers can't all play .${ext}, convert it to .mp4 (H.264)`);
      continue;
    }
    const kind = KINDS[ext];
    if (!kind) {
      errors.push(`${where}: unsupported file type (use mp4/webm, png/jpg/webp/gif/svg, pdf or html)`);
      continue;
    }
    if (size > MAX_BYTES) {
      errors.push(`${where}: ${(size / 1024 / 1024).toFixed(1)}MB, over the ${MAX_BYTES / 1024 / 1024}MB limit; compress it`);
      continue;
    }

    const item = { title: displayName(parts.at(-1)), kind, src: where };
    if (kind === 'video') {
      const vtt = `${stem(rel)}.vtt`;
      if (captions.has(vtt)) {
        item.captions = `media/${vtt}`;
        usedCaptions.add(vtt);
      } else {
        warnings.push(`${where}: no captions (add ${parts.at(-1).replace(/\.[^.]+$/, '')}.vtt next to it)`);
      }
    }
    const group = parts.length === 3 ? parts[1] : '';
    if (!bySubject.has(subject)) bySubject.set(subject, new Map());
    const groups = bySubject.get(subject);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ name: parts.at(-1), item });
  }

  for (const vtt of captions) {
    if (!usedCaptions.has(vtt) && !ignored(vtt)) {
      errors.push(`media/${vtt}: captions without a video of the same name (.mp4 or .webm)`);
    }
  }

  // Catalog order for subjects; numeric-aware names for folders and files, loose files first.
  const subjects = {};
  for (const id of subjectIds) {
    const groups = bySubject.get(id);
    if (!groups) continue;
    subjects[id] = {
      groups: [...groups.entries()]
        .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : collator.compare(a, b)))
        .map(([folder, entries]) => ({
          name: folder === '' ? '' : displayName(folder, { isFile: false }),
          items: entries.sort((a, b) => collator.compare(a.name, b.name)).map((e) => e.item),
        })),
    };
  }
  return { manifest: { subjects }, errors, warnings };
}

/** How many items the whole manifest has. */
export const mediaTotal = (manifest) => Object.keys(manifest?.subjects ?? {}).reduce((n, id) => n + mediaCount(manifest, id), 0);

export const serializeMedia = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

/** Every file under media/ as { path, size }, paths relative to media/ with '/' separators. */
export async function scanMedia(dir = MEDIA_DIR) {
  const out = [];
  async function walk(sub) {
    let names;
    try {
      names = await readdir(path.join(dir, sub));
    } catch (err) {
      if (err.code === 'ENOENT' && sub === '') return; // no media/ folder yet
      throw err;
    }
    for (const name of names) {
      const rel = sub ? `${sub}/${name}` : name;
      const info = await stat(path.join(dir, rel));
      if (info.isDirectory()) await walk(rel);
      else out.push({ path: rel, size: info.size });
    }
  }
  await walk('');
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Builds the manifest from disk and checks the files; with `write`, also saves it. */
export async function checkMedia(subjectIds, { write = false, dir = MEDIA_DIR } = {}) {
  const { manifest, errors, warnings } = buildMedia(await scanMedia(dir), subjectIds);
  // HTML artifacts (often exported from Claude) may pull scripts from a CDN: allowed, but flagged.
  for (const item of Object.values(manifest.subjects).flatMap((s) => s.groups.flatMap((g) => g.items))) {
    if (item.kind !== 'html') continue;
    const html = await readFile(path.join(dir, item.src.slice('media/'.length)), 'utf8');
    if (/\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(html)) {
      warnings.push(`${item.src}: loads external resources (a CDN?), so it needs a connection and isn't self-hosted`);
    }
  }
  if (write) await writeFile(path.join(dir, MEDIA_MANIFEST), serializeMedia(manifest));
  return { manifest, errors, warnings };
}
