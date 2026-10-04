import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MAX_BYTES, buildMedia, checkMedia, displayName } from '../scripts/media.mjs';
import { mediaCount } from '../js/catalog.js';
import { loadCatalog } from '../scripts/quizzes.mjs';

const ids = ['anatomy', 'pharmacology'];
const f = (p, size = 1000) => ({ path: p, size });

test('displayName drops the extension (files) and an ordering prefix', () => {
  assert.equal(displayName('01 - נושא א.mp4'), 'נושא א');
  assert.equal(displayName('2_נושא ב.pdf'), 'נושא ב');
  assert.equal(displayName('3. נושא ג', { isFile: false }), 'נושא ג');
  assert.equal(displayName('3. נושא ג.pdf'), 'נושא ג');
  assert.equal(displayName('נושא ד.png'), 'נושא ד');
  // A name that is only a number stays a number.
  assert.equal(displayName('12.png'), '12');
});

test('buildMedia groups by sub-subject folder in numeric order, loose files first', () => {
  const { manifest, errors } = buildMedia([
    f('pharmacology/10 - נושא י/1 - סרטון.mp4'),
    f('pharmacology/2 - נושא ב/2 - תרשים.png'),
    f('pharmacology/2 - נושא ב/10 - דף.pdf'),
    f('pharmacology/כללי.html'),
  ], ids);
  assert.deepEqual(errors, []);
  const groups = manifest.subjects.pharmacology.groups;
  assert.deepEqual(groups.map((g) => g.name), ['', 'נושא ב', 'נושא י']);
  assert.deepEqual(groups[1].items.map((i) => [i.title, i.kind]), [['תרשים', 'image'], ['דף', 'pdf']]);
  assert.equal(groups[0].items[0].src, 'media/pharmacology/כללי.html');
  assert.equal(mediaCount(manifest, 'pharmacology'), 4);
  assert.equal(mediaCount(manifest, 'anatomy'), 0);
  assert.deepEqual(Object.keys(manifest.subjects), ['pharmacology']);
});

test('buildMedia pairs captions with their video and warns about videos without them', () => {
  const { manifest, errors, warnings } = buildMedia([
    f('pharmacology/א/1 - סרטון.mp4'),
    f('pharmacology/א/1 - סרטון.vtt'),
    f('pharmacology/א/2 - בלי.webm'),
  ], ids);
  assert.deepEqual(errors, []);
  const [withCaptions, without] = manifest.subjects.pharmacology.groups[0].items;
  assert.equal(withCaptions.captions, 'media/pharmacology/א/1 - סרטון.vtt');
  assert.equal(without.captions, undefined);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /בלי\.webm: no captions/);
});

test('buildMedia rejects course files, unplayable video, big files, bad places and stray captions', () => {
  const { manifest, errors } = buildMedia([
    f('pharmacology/א/מצגת.pptx'),
    f('pharmacology/א/סרטון.mov'),
    f('pharmacology/א/קובץ.zip'),
    f('pharmacology/א/גדול.mp4', MAX_BYTES + 1),
    f('pharmacology/א/ב/עמוק.png'),
    f('loose.png'),
    f('chemistry/x.png'),
    f('pharmacology/א/יתום.vtt'),
  ], ids);
  for (const re of [/pptx.*public/, /convert it to \.mp4/, /unsupported/, /over the 50MB/, /media\/<subject-id>/, /media\/loose\.png/, /"chemistry"/, /captions without a video/]) {
    assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}`);
  }
  assert.deepEqual(manifest.subjects, {});
});

test('buildMedia ignores notes, dotfiles and the manifest itself', () => {
  const { manifest, errors } = buildMedia([
    f('README.md'), f('manifest.json'), f('pharmacology/.gitkeep'), f('pharmacology/א/.DS_Store'),
  ], ids);
  assert.deepEqual(errors, []);
  assert.deepEqual(manifest, { subjects: {} });
});

test('checkMedia writes the manifest and flags HTML that loads from a CDN', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'media-'));
  try {
    await mkdir(path.join(dir, 'pharmacology', '1 - נושא'), { recursive: true });
    await writeFile(path.join(dir, 'pharmacology', '1 - נושא', 'סרטון.mp4'), 'placeholder');
    await writeFile(path.join(dir, 'pharmacology', 'עמוד.html'), '<script src="https://cdn.example/x.js"></script>');
    const written = await checkMedia(ids, { write: true, dir });
    assert.deepEqual(written.errors, []);
    assert.ok(written.warnings.some((w) => /עמוד\.html: loads external/.test(w)));
    const saved = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    assert.deepEqual(saved, written.manifest);
    assert.equal(mediaCount(saved, 'pharmacology'), 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the committed media folder and manifest pass every check', async () => {
  const { catalog } = await loadCatalog();
  assert.deepEqual((await checkMedia(catalog.subjects.map((s) => s.id))).errors, []);
});
