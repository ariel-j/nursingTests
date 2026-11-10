// Pure video logic: metadata validation, mp4 / WebVTT checks, duration. No DOM, no storage, no network.
// A video is three files that share one id: videos/<id>.json (metadata), videos/<id>.mp4, and an optional
// videos/<id>.vtt (Hebrew captions). The metadata's `file` / `captions` must equal those exact names, so a
// file path can never come from user input.
import { isPlainObject, isText, isValidQuizId, unknownKeys } from './core.js';

// Site-wide ceiling (the validator). The admin panel is stricter because it uploads from the browser.
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const PANEL_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VTT_BYTES = 1024 * 1024;
export const MAX_DURATION_SEC = 24 * 60 * 60;

const VIDEO_KEYS = new Set(['id', 'subject', 'unit', 'title', 'description', 'file', 'captions', 'durationSec']);

export const videoFile = (id) => `${id}.mp4`;
export const captionsFile = (id) => `${id}.vtt`;

/** Human-readable problems; an empty list means the metadata is valid. */
export function validateVideo(video) {
  const errors = [];
  if (!isPlainObject(video)) return ['video must be a JSON object'];

  unknownKeys(video, VIDEO_KEYS, 'video', errors);
  if (!isValidQuizId(video.id)) errors.push('video.id must be lowercase letters, digits and single hyphens');
  if (!isText(video.subject)) errors.push('video.subject must be a non-empty string');
  if (video.unit !== undefined && !isText(video.unit)) errors.push('video.unit must be a non-empty string');
  if (!isText(video.title)) errors.push('video.title must be a non-empty string');
  if (video.description !== undefined && typeof video.description !== 'string') {
    errors.push('video.description must be a string');
  }
  if (isValidQuizId(video.id)) {
    if (video.file !== videoFile(video.id)) errors.push(`video.file must be "${videoFile(video.id)}"`);
    if (video.captions !== undefined && video.captions !== captionsFile(video.id)) {
      errors.push(`video.captions must be "${captionsFile(video.id)}" when present`);
    }
  } else if (typeof video.file !== 'string') {
    errors.push('video.file must be a string');
  }
  if (video.durationSec !== undefined
    && !(Number.isInteger(video.durationSec) && video.durationSec >= 1 && video.durationSec <= MAX_DURATION_SEC)) {
    errors.push(`video.durationSec must be a whole number of seconds, 1-${MAX_DURATION_SEC}`);
  }
  return errors;
}

// ---------- mp4 ----------

const ascii = (bytes, from, to) => String.fromCharCode(...bytes.subarray(from, to));

/** True when the bytes start with an ISO base media "ftyp" box (the signature of an mp4). */
export function isMp4(bytes) {
  return bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp';
}

const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u64 = (b, o) => u32(b, o) * 2 ** 32 + u32(b, o + 4);

/** The boxes between `from` and `to`: [{ type, start, end, body }]. Stops at anything malformed. */
function* boxes(bytes, from, to) {
  let pos = from;
  while (pos + 8 <= to) {
    let size = u32(bytes, pos);
    const type = ascii(bytes, pos + 4, pos + 8);
    let body = pos + 8;
    if (size === 1) {
      if (pos + 16 > to) return;
      size = u64(bytes, pos + 8);
      body = pos + 16;
    } else if (size === 0) {
      size = to - pos;
    }
    if (size < body - pos || pos + size > to) return; // truncated or nonsensical: stop, never loop
    yield { type, start: pos, end: pos + size, body };
    pos += size;
  }
}

/**
 * Whole seconds of an mp4, read from its movie header (moov > mvhd), or null when it cannot be read.
 * `bytes` is the whole file (the moov box may come first or last).
 */
export function readMp4Duration(bytes) {
  for (const top of boxes(bytes, 0, bytes.length)) {
    if (top.type !== 'moov') continue;
    for (const child of boxes(bytes, top.body, top.end)) {
      if (child.type !== 'mvhd') continue;
      const v = bytes[child.body];
      const at = child.body + 4; // skip version + flags
      let timescale;
      let duration;
      if (v === 0 && at + 16 <= child.end) {
        timescale = u32(bytes, at + 8);
        duration = u32(bytes, at + 12);
      } else if (v === 1 && at + 28 <= child.end) {
        timescale = u32(bytes, at + 16);
        duration = u64(bytes, at + 20);
      } else {
        return null;
      }
      if (!timescale || !Number.isFinite(duration / timescale)) return null;
      const seconds = Math.round(duration / timescale);
      return seconds >= 1 && seconds <= MAX_DURATION_SEC ? seconds : null;
    }
  }
  return null;
}

// ---------- captions (WebVTT) ----------

/** Problems with a WebVTT text. A caption file is plain text shown by the browser's own track renderer. */
export function vttErrors(text) {
  const errors = [];
  if (typeof text !== 'string') return ['captions must be text'];
  if (text.length > MAX_VTT_BYTES) errors.push('captions file is too large');
  if (text.includes('\u0000')) errors.push('captions contain binary data');
  if (!/^﻿?WEBVTT(?:[ \t\n\r]|$)/.test(text)) errors.push('captions must start with WEBVTT');
  if (!/-->/.test(text)) errors.push('captions have no cues');
  return errors;
}

// ---------- display ----------

/** "12 דק'" for 715 seconds; "45 שנ'" under a minute; "1:05 שעות" from an hour. */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 1) return '';
  if (seconds < 60) return `${Math.round(seconds)} שנ'`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} דק'`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} שעות`;
}

/** "3:20" or "1:02:05": a playback position. */
export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** The saved position is worth resuming only when it is past the intro and not at the very end. */
export function resumePosition(saved, duration) {
  if (!saved || !Number.isFinite(saved.t) || saved.t < 10) return 0;
  if (Number.isFinite(duration) && saved.t > duration - 10) return 0;
  return saved.t;
}
