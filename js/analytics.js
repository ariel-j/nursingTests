// Visit counter: sends one page view per page load, and quiz events, to GoatCounter
// (no cookies, no IP stored, open source). This is the only request the site makes to another
// server; privacy.html describes exactly what is sent. No third-party script is loaded: the
// request is built here and sent as an image GET (sendBeacon's POST did not register hits).
//
// Nothing is sent while GOATCOUNTER_CODE is empty, off the live site (localhost, file://),
// under Do Not Track / Global Privacy Control, or from a browser that opted out by visiting
// any page with #no-count (undo with #count).
//
// Unique people: the first page of each day also sends `visitors/day/new` or
// `visitors/day/returning`, and the first page of each week `visitors/week`. The browser keeps
// only the day and the week it last sent (`visitor` in storage); no id is created or sent.
import { load, remove, save } from './storage.js';

export const GOATCOUNTER_CODE = 'ari';
export const LIVE_HOST_SUFFIX = '.github.io';
const OPT_OUT_KEY = 'no-count';
const VISITOR_KEY = 'visitor';
// Query parameters that pick what a page shows (a quiz, a subject, a drug deck); everything
// else is dropped. Fixed order, so the same page always counts under the same path.
const KEPT_PARAMS = ['id', 'subject', 'drugs', 'exam'];

/**
 * The path a page is counted under: `base` (the site's folder, e.g. /nursingTests/) and `.html`
 * are dropped and index.html folds into its folder, so the dashboard rows stay short on a
 * phone; only KEPT_PARAMS stay, so each quiz, subject and deck counts separately and nothing
 * else leaks in.
 */
export function pagePath(pathname, search = '', base = '/') {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length - 1) : pathname;
  const path = rest.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const name of KEPT_PARAMS) {
    const value = params.get(name);
    if (value) kept.set(name, value);
  }
  const query = kept.toString();
  return query ? `${path}?${query}` : path;
}

const pad = (n) => String(n).padStart(2, '0');
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The visitor events this page load sends, and the record to keep. `record` is what the
 * browser stored last time (null on a first visit); weeks start on Sunday, local time.
 */
export function visitorEvents(record, now) {
  const day = localDay(now);
  const week = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()));
  const events = [];
  if (record?.day !== day) events.push(`visitors/day/${record ? 'returning' : 'new'}`);
  if (record?.week !== week) events.push('visitors/week');
  return { events, record: { day, week } };
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

// The site's folder on the host (/nursingTests/ on GitHub Pages), from where this file lives.
const SITE_BASE = typeof window !== 'undefined' ? new URL('..', import.meta.url).pathname : '/';

const allowed = typeof window !== 'undefined' && enabled();

/** Counts a named event, e.g. `quiz-done/heart/full`. Safe to call when counting is off. */
export function trackEvent(name, title = '') {
  if (allowed) send(countUrl(GOATCOUNTER_CODE, { path: name, title, event: true }));
}

function countVisitor() {
  const { events, record } = visitorEvents(load(VISITOR_KEY), new Date());
  // Without storage every page would look like a new person, so count nothing rather than too much.
  if (events.length === 0 || !save(VISITOR_KEY, record)) return;
  for (const name of events) trackEvent(name);
}

// Pages set their real title (the quiz, the subject) after loading their data, so the page view
// waits for the first title change; a page that never changes it is counted after a short delay
// or when it is left, so quick visits still count.
const TITLE_WAIT_MS = 4000;

function sendPageView() {
  if (viewSent) return;
  viewSent = true;
  send(countUrl(GOATCOUNTER_CODE, {
    path: pagePath(location.pathname, location.search, SITE_BASE),
    title: document.title,
    referrer: document.referrer,
    screen: `${screen.width},${screen.height},${window.devicePixelRatio || 1}`,
  }));
}

let viewSent = false;
if (allowed) {
  countVisitor();
  const titleEl = document.querySelector('title');
  if (titleEl) new MutationObserver(sendPageView).observe(titleEl, { childList: true, characterData: true, subtree: true });
  setTimeout(sendPageView, TITLE_WAIT_MS);
  addEventListener('pagehide', sendPageView);
}
