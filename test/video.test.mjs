import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { formatClock, formatDuration, isMp4, resumePosition, readMp4Duration, validateVideo, vttErrors, MAX_DURATION_SEC } from '../js/video-core.js';
import { buildManifest, countVideos, loadAll, loadVideos } from '../scripts/quizzes.mjs';
import { parseRange, server } from '../scripts/serve.mjs';

// ---- tiny mp4 builder (placeholder bytes only; never a real recording) ----
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be64 = (n) => [...be32(Math.floor(n / 2 ** 32)), ...be32(n >>> 0)];
const box = (type, ...payload) => {
  const body = payload.flat();
  return [...be32(8 + body.length), ...[...type].map((c) => c.charCodeAt(0)), ...body];
};
const mvhd0 = (timescale, duration) => box('mvhd', 0, 0, 0, 0, ...be32(0), ...be32(0), ...be32(timescale), ...be32(duration), ...new Array(80).fill(0));
const mvhd1 = (timescale, duration) => box('mvhd', 1, 0, 0, 0, ...be64(0), ...be64(0), ...be32(timescale), ...be64(duration), ...new Array(80).fill(0));
const ftyp = box('ftyp', ...[...'isom'].map((c) => c.charCodeAt(0)), ...be32(512));
const mp4 = (...parts) => Uint8Array.from(parts.flat());

test('isMp4 recognises the ftyp signature only', () => {
  assert.ok(isMp4(mp4(ftyp)));
  assert.ok(!isMp4(new TextEncoder().encode('<html>not a video at all</html>')));
  assert.ok(!isMp4(new Uint8Array(4)));
  assert.ok(!isMp4(new Uint8Array(0)));
});

test('readMp4Duration: version 0 and 1 headers, moov first or last, rounding', () => {
  const mdat = box('mdat', ...new Array(50).fill(7));
  assert.equal(readMp4Duration(mp4(ftyp, box('moov', mvhd0(1000, 715000)), mdat)), 715);
  assert.equal(readMp4Duration(mp4(ftyp, mdat, box('moov', mvhd0(90000, 90000 * 453)))), 453, 'moov after mdat');
  assert.equal(readMp4Duration(mp4(ftyp, box('moov', mvhd1(600, 600 * 3725)), mdat)), 3725, '64-bit header');
  assert.equal(readMp4Duration(mp4(ftyp, box('moov', mvhd0(1000, 1499)))), 1, '1.499s rounds to 1');
  assert.equal(readMp4Duration(mp4(ftyp, box('moov', mvhd0(1000, 1500)))), 2);
});

test('readMp4Duration never loops or throws on hostile or broken input', () => {
  assert.equal(readMp4Duration(new Uint8Array(0)), null);
  assert.equal(readMp4Duration(mp4(ftyp)), null, 'no moov');
  assert.equal(readMp4Duration(mp4(ftyp, box('moov', mvhd0(0, 5000)))), null, 'zero timescale');
  assert.equal(readMp4Duration(mp4(ftyp, box('moov', mvhd0(1000, 0)))), null, 'zero duration');
  assert.equal(readMp4Duration(mp4(ftyp, box('moov', mvhd0(1, MAX_DURATION_SEC + 5)))), null, 'longer than a day');
  assert.equal(readMp4Duration(mp4(ftyp, [0, 0, 0, 0, 109, 111, 111, 118, 1, 2, 3])), null, 'size 0 box runs to the end, holds no mvhd');
  assert.equal(readMp4Duration(mp4(ftyp, be32(0xffffffff), [109, 111, 111, 118])), null, 'size beyond the file');
  assert.equal(readMp4Duration(mp4(ftyp, be32(4), [109, 111, 111, 118])), null, 'size smaller than its own header');
  assert.equal(readMp4Duration(mp4(ftyp, [0, 0, 0, 1, 109, 111, 111, 118, ...be64(2 ** 40)])), null, '64-bit size beyond the file');
  const truncated = mp4(ftyp, box('moov', mvhd0(1000, 5000))).slice(0, -20);
  assert.equal(readMp4Duration(truncated), null, 'truncated file');
  assert.equal(readMp4Duration(mp4(ftyp, box('moov', box('mvhd', 9, 0, 0, 0, 1, 2, 3)))), null, 'unknown mvhd version');
});

test('validateVideo: accepts good metadata; the file names are tied to the id', () => {
  const ok = { id: 'opioids', subject: 'פרמקולוגיה', unit: 'אופיואידים', title: 'אופיואידים', file: 'opioids.mp4', captions: 'opioids.vtt', durationSec: 587 };
  assert.deepEqual(validateVideo(ok), []);
  assert.deepEqual(validateVideo({ id: 'a', subject: 's', title: 't', file: 'a.mp4' }), [], 'unit, description, captions, duration are optional');
  assert.ok(validateVideo(null).length > 0);
  assert.ok(validateVideo({ ...ok, extra: 1 }).some((e) => /unknown field/.test(e)));
  assert.ok(validateVideo({ ...ok, id: 'Bad' }).length > 0);
  for (const file of ['other.mp4', '../x.mp4', 'opioids.mov', 'sub/opioids.mp4', 'http://evil/x.mp4', '//evil/x.mp4', 'opioids.mp4?x=1']) {
    assert.ok(validateVideo({ ...ok, file }).some((e) => /video\.file/.test(e)), file);
  }
  for (const captions of ['x.vtt', '../opioids.vtt', 'opioids.srt', 'https://evil/opioids.vtt']) {
    assert.ok(validateVideo({ ...ok, captions }).some((e) => /captions/.test(e)), captions);
  }
  for (const durationSec of [0, -3, 1.5, '90', MAX_DURATION_SEC + 1, NaN]) {
    assert.ok(validateVideo({ ...ok, durationSec }).some((e) => /durationSec/.test(e)), String(durationSec));
  }
  assert.ok(validateVideo({ ...ok, title: '' }).length > 0);
  assert.ok(validateVideo({ ...ok, subject: '' }).length > 0);
  assert.ok(validateVideo({ ...ok, unit: '' }).length > 0);
  assert.ok(validateVideo({ ...ok, description: 3 }).length > 0);
});

test('vttErrors: needs the WEBVTT header and cues; rejects binary and oversize', () => {
  const good = 'WEBVTT\n\n00:00.000 --> 00:02.000\nשלום\n';
  assert.deepEqual(vttErrors(good), []);
  assert.deepEqual(vttErrors('﻿WEBVTT - מדומה\n\n00:00.000 --> 00:01.000\nx'), [], 'BOM and a header comment are fine');
  assert.ok(vttErrors('1\n00:00:00,000 --> 00:00:02,000\nSRT, not VTT').some((e) => /WEBVTT/.test(e)));
  assert.ok(vttErrors('WEBVTTX\n\n00:00.000 --> 00:01.000\nx').some((e) => /WEBVTT/.test(e)));
  assert.ok(vttErrors('WEBVTT\n\nno cues here').some((e) => /no cues/.test(e)));
  assert.ok(vttErrors(good + '\u0000').some((e) => /binary/.test(e)));
  assert.ok(vttErrors(good + 'x'.repeat(1024 * 1024)).some((e) => /too large/.test(e)));
  assert.ok(vttErrors(null).length > 0);
});

test('formatDuration: seconds, minutes, hours', () => {
  assert.equal(formatDuration(45), "45 שנ'");
  assert.equal(formatDuration(715), "12 דק'");
  assert.equal(formatDuration(3725), '1:02 שעות');
  assert.equal(formatDuration(0), '');
  assert.equal(formatDuration(undefined), '');
});

// ---- manifest ----
const catalog = { subjects: [{ name: 'פרמקולוגיה', units: ['אופיואידים', 'NSAID'] }, { name: 'כללי' }] };
const vid = (id, subject, title, extra = {}) => ({ id, subject, title, file: `${id}.mp4`, ...extra });

test('buildManifest: videos at subject and unit level, sorted by title, with duration and caption flags', () => {
  const m = buildManifest([], catalog, [], [
    vid('v10', 'פרמקולוגיה', 'סרטון 10', { unit: 'אופיואידים', durationSec: 600, captions: 'v10.vtt' }),
    vid('v2', 'פרמקולוגיה', 'סרטון 2', { unit: 'אופיואידים' }),
    vid('g1', 'כללי', 'כללי א'),
  ]);
  const unit = m.subjects[0].units[0];
  assert.deepEqual(unit.videos.map((v) => v.id), ['v2', 'v10']);
  assert.deepEqual(unit.videos[0], { id: 'v2', title: 'סרטון 2', description: '', hasCaptions: false }, 'no duration key when unknown');
  assert.deepEqual(unit.videos[1], { id: 'v10', title: 'סרטון 10', description: '', durationSec: 600, hasCaptions: true });
  assert.deepEqual(m.subjects[0].units[1].videos, []);
  assert.deepEqual(m.subjects[1].videos.map((v) => v.id), ['g1']);
  assert.equal(countVideos(m), 3);
  assert.equal(countVideos({ subjects: [{ units: [{}] }] }), 0, 'tolerates an old manifest');
  assert.deepEqual(buildManifest([], catalog).subjects[1].videos, [], 'stable shape without videos');
});

// ---- loader: metadata + media files ----
async function withDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'videos-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true }); }
}
const goodMp4 = Buffer.from(mp4(ftyp, box('moov', mvhd0(1000, 60000)), box('mdat', 1, 2, 3)));
const goodVtt = 'WEBVTT\n\n00:00.000 --> 00:02.000\nשלום\n';
const meta = (id, extra = {}) => JSON.stringify({ id, subject: 'כללי', title: 'כותרת', file: `${id}.mp4`, ...extra });

test('loadVideos accepts a complete video and a missing folder', async () => {
  assert.deepEqual(await loadVideos(path.join(tmpdir(), 'does-not-exist-videos')), []);
  await withDir(async (dir) => {
    await writeFile(path.join(dir, 'a.json'), meta('a', { captions: 'a.vtt', durationSec: 60 }));
    await writeFile(path.join(dir, 'a.mp4'), goodMp4);
    await writeFile(path.join(dir, 'a.vtt'), goodVtt);
    const entries = await loadVideos(dir, catalog);
    assert.deepEqual(entries.map((e) => [e.file, e.errors]), [['videos/a.json', []]]);
  });
});

test('loadVideos reports bad media: missing, not an mp4, bad captions, wrong file name, bad placement', async () => {
  await withDir(async (dir) => {
    await writeFile(path.join(dir, 'nomp4.json'), meta('nomp4'));
    await writeFile(path.join(dir, 'fake.json'), meta('fake'));
    await writeFile(path.join(dir, 'fake.mp4'), '<html>definitely not a video</html>');
    await writeFile(path.join(dir, 'badcap.json'), meta('badcap', { captions: 'badcap.vtt' }));
    await writeFile(path.join(dir, 'badcap.mp4'), goodMp4);
    await writeFile(path.join(dir, 'badcap.vtt'), '1\n00:00:00,000 --> 00:00:02,000\nSRT');
    await writeFile(path.join(dir, 'nocap.json'), meta('nocap', { captions: 'nocap.vtt' }));
    await writeFile(path.join(dir, 'nocap.mp4'), goodMp4);
    await writeFile(path.join(dir, 'wrongname.json'), meta('other-id'));
    await writeFile(path.join(dir, 'place.json'), JSON.stringify({ id: 'place', subject: 'לא קיים', title: 't', file: 'place.mp4' }));
    await writeFile(path.join(dir, 'place.mp4'), goodMp4);
    await writeFile(path.join(dir, 'broken.json'), '{ nope');
    const by = Object.fromEntries((await loadVideos(dir, catalog)).map((e) => [e.file, e.errors.join(' | ')]));
    assert.match(by['videos/nomp4.json'], /nomp4\.mp4 is missing/);
    assert.match(by['videos/fake.json'], /not an mp4/);
    assert.match(by['videos/badcap.json'], /badcap\.vtt: captions must start with WEBVTT/);
    assert.match(by['videos/nocap.json'], /nocap\.vtt is missing/);
    assert.match(by['videos/wrongname.json'], /file name must be/);
    assert.match(by['videos/place.json'], /not in/);
    assert.match(by['videos/broken.json'], /cannot parse/);
  });
});

test('loadVideos reports orphan and unexpected files so nothing is published by accident', async () => {
  await withDir(async (dir) => {
    await writeFile(path.join(dir, 'orphan.mp4'), goodMp4);
    await writeFile(path.join(dir, 'orphan2.vtt'), goodVtt);
    await writeFile(path.join(dir, 'script.js'), 'alert(1)');
    await writeFile(path.join(dir, 'movie.mov'), goodMp4);
    const by = Object.fromEntries((await loadVideos(dir, catalog)).map((e) => [e.file, e.errors.join(' | ')]));
    assert.match(by['videos/orphan.mp4'], /no orphan\.json describes/);
    assert.match(by['videos/orphan2.vtt'], /no orphan2\.json describes/);
    assert.match(by['videos/script.js'], /only \.json, \.mp4 and \.vtt/);
    assert.match(by['videos/movie.mov'], /only \.json, \.mp4 and \.vtt/);
  });
});

test('loadAll reads videos only from the real folder or an explicit one', async () => {
  await withDir(async (dir) => {
    await mkdir(path.join(dir, 'q'));
    await writeFile(path.join(dir, 'q', 'subjects.json'), JSON.stringify({ subjects: [{ name: 'כללי' }] }));
    await mkdir(path.join(dir, 'v'));
    await writeFile(path.join(dir, 'v', 'a.json'), meta('a'));
    await writeFile(path.join(dir, 'v', 'a.mp4'), goodMp4);
    assert.deepEqual((await loadAll(path.join(dir, 'q'))).videoEntries, [], 'custom quiz folder -> no implicit videos');
    const all = await loadAll(path.join(dir, 'q'), null, path.join(dir, 'v'));
    assert.equal(all.videoEntries.length, 1);
    assert.equal(all.failures, 0);
  });
});

// ---- dev server: Range requests (what makes seeking work) ----
test('parseRange handles start-end, open end, suffix and invalid ranges', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=900-', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=0-5000', 1000), { start: 0, end: 999 }, 'end is clamped');
  assert.equal(parseRange(undefined, 1000), null);
  for (const bad of ['bytes=2000-', 'bytes=5-2', 'bytes=-', 'items=0-1', 'bytes=0-1,5-6', 'bytes=a-b']) {
    assert.equal(parseRange(bad, 1000), 'invalid', bad);
  }
});

test('the dev server answers 206 with Content-Range for the real files and 416 for a bad range', async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const base = `http://localhost:${server.address().port}`;
    const full = await fetch(`${base}/package.json`);
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('accept-ranges'), 'bytes');
    const total = Number(full.headers.get('content-length'));
    const part = await fetch(`${base}/package.json`, { headers: { Range: 'bytes=0-9' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 0-9/${total}`);
    assert.equal((await part.arrayBuffer()).byteLength, 10);
    const bad = await fetch(`${base}/package.json`, { headers: { Range: `bytes=${total + 50}-` } });
    assert.equal(bad.status, 416);
    assert.equal((await fetch(`${base}/nope.mp4`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('formatClock and resumePosition: where to resume a half-watched video', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(200.9), '3:20');
  assert.equal(formatClock(3725), '1:02:05');
  assert.equal(formatClock(-5), '0:00');
  assert.equal(formatClock(NaN), '0:00');
  assert.equal(resumePosition({ t: 200 }, 587), 200);
  assert.equal(resumePosition({ t: 5 }, 587), 0, 'still in the intro: start from the beginning');
  assert.equal(resumePosition({ t: 580 }, 587), 0, 'at the very end: start over');
  assert.equal(resumePosition({ t: 200 }, undefined), 200, 'duration unknown yet');
  assert.equal(resumePosition(null, 587), 0);
  assert.equal(resumePosition({ t: 'x' }, 587), 0);
  assert.equal(resumePosition({}, 587), 0);
});
