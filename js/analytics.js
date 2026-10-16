// Visit counter: sends one page view per page load, and quiz events, to GoatCounter
// (no cookies, no IP stored, open source). This is the only request the site makes to another
// server; privacy.html describes exactly what is sent. No third-party script is loaded: the
// request is built here and sent as an image GET (sendBeacon's POST did not register hits).
//
// Nothing is sent while GOATCOUNTER_CODE is empty, off the live site (localhost, file://),
// under Do Not Track / Global Privacy Control, or from a browser that opted out by visiting
// any page with #no-count (undo with #count).
import { load, remove, save } from './storage.js';

export const GOATCOUNTER_CODE = 'ari';
export const LIVE_HOST_SUFFIX = '.github.io';
const OPT_OUT_KEY = 'no-count';

/**
 * The path a page is counted under: index.html folds into its folder, and only the `id`
 * query parameter is kept, so each quiz counts separately and nothing else leaks in.
 */
export function pagePath(pathname, search = '') {
  const path = pathname.replace(/\/index\.html$/, '/');
  const id = new URLSearchParams(search).get('id');
  return id ? `${path}?id=${encodeURIComponent(id)}` : path;
}

/** Whether this visit may be counted. `env` is a plain snapshot so the rule is testable. */
export function shouldCount({ code, hostname, doNotTrack, gpc, webdriver, optedOut }) {
  if (!code || !/^[a-z0-9-]+$/.test(code)) return false;
  if (!hostname.endsWith(LIVE_HOST_SUFFIX)) return false;
  return !(doNotTrack === '1' || gpc === true || webdriver === true || optedOut);
}

/** The GoatCounter /count URL for a page view (`event: false`) or a named event. */
export function countUrl(code, { path, title = '', referrer = '', screen = '', event = false }) {
  const params = new URLSearchParams({ p: path, t: title, r: referrer, s: screen, e: String(event) });
  return `https://${code}.goatcounter.com/count?${params}`;
}

// ---------- browser ----------

function optedOut() {
  if (location.hash === '#no-count') save(OPT_OUT_KEY, true);
  else if (location.hash === '#count') remove(OPT_OUT_KEY);
  return load(OPT_OUT_KEY) === true;
}

function enabled() {
  return shouldCount({
    code: GOATCOUNTER_CODE,
    hostname: location.hostname,
    doNotTrack: navigator.doNotTrack,
    gpc: navigator.globalPrivacyControl,
    webdriver: navigator.webdriver,
    optedOut: optedOut(),
  });
}

function send(url) {
  try {
    // rnd keeps the browser from answering a repeat visit from its image cache.
    new Image().src = `${url}&rnd=${Math.random().toString(36).slice(2)}`;
  } catch {
    // counting must never break the page
  }
}

const allowed = typeof window !== 'undefined' && enabled();

/** Counts a named event, e.g. `quiz-done/heart/full`. Safe to call when counting is off. */
export function trackEvent(name, title = '') {
  if (allowed) send(countUrl(GOATCOUNTER_CODE, { path: name, title, event: true }));
}

if (allowed) {
  send(countUrl(GOATCOUNTER_CODE, {
    path: pagePath(location.pathname, location.search),
    title: document.title,
    referrer: document.referrer,
    screen: `${screen.width},${screen.height},${window.devicePixelRatio || 1}`,
  }));
}
