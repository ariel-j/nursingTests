// The only module that talks to the network, and only to api.github.com. The token is held in a
// closure, sent only in the Authorization header, and never logged or put in a URL.
// `fetchImpl` is injected so tests can use a fake GitHub.
import { isWritablePath } from './uploads.js';

const API = 'https://api.github.com';
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

export class GithubError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export class ConflictError extends GithubError {}

const utf8ToB64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64ToUtf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

const explain = (status) =>
  ({
    401: 'הטוקן אינו תקף או שפג תוקפו',
    403: 'אין הרשאת כתיבה (בדקו את הרשאות הטוקן) או שחרגתם ממגבלת הקריאות',
    404: 'המאגר או הקובץ לא נמצאו (או שלטוקן אין גישה למאגר)',
    409: 'התנגשות בגרסה',
    422: 'GitHub דחה את הבקשה',
  })[status] ?? `שגיאת GitHub (${status})`;

export function createGithub({ token, owner, repo, branch = 'main', fetchImpl = globalThis.fetch.bind(globalThis) }) {
  if (!NAME_RE.test(owner) || !NAME_RE.test(repo) || !NAME_RE.test(branch)) throw new Error('bad repository settings');
  const base = `/repos/${owner}/${repo}`;

  async function call(method, path, body) {
    const res = await fetchImpl(`${API}${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) throw new GithubError(explain(res.status), res.status);
    return res.status === 204 ? null : res.json();
  }

  const head = async () => {
    const ref = await call('GET', `/git/ref/heads/${branch}`);
    const commit = await call('GET', `/git/commits/${ref.object.sha}`);
    return { commitSha: ref.object.sha, treeSha: commit.tree.sha };
  };

  /** All file paths at a commit (recursive tree), used to find the quiz files. */
  async function listFiles(treeSha) {
    const tree = await call('GET', `/git/trees/${treeSha}?recursive=1`);
    if (tree.truncated) throw new GithubError('המאגר גדול מדי לקריאה מלאה', 413);
    return tree.tree.filter((t) => t.type === 'blob').map((t) => t.path);
  }

  async function readText(path, commitSha) {
    const file = await call('GET', `/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${commitSha}`);
    if (file.encoding !== 'base64') throw new GithubError('קובץ גדול מדי לקריאה', 413);
    return b64ToUtf8(file.content);
  }

  /**
   * One atomic commit. `files` = [{ path, text }] to write, `deletes` = [path]. Every path must be on the
   * panel's allowlist. Non-forced ref update: if main moved, throws ConflictError (caller rebuilds).
   */
  async function commit({ files = [], deletes = [], message, parent }) {
    for (const p of [...files.map((f) => f.path), ...deletes]) {
      if (!isWritablePath(p)) throw new Error(`path not allowed: ${p}`);
    }
    const entries = [];
    for (const f of files) {
      const blob = await call('POST', '/git/blobs', { content: utf8ToB64(f.text), encoding: 'base64' });
      entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    for (const path of deletes) entries.push({ path, mode: '100644', type: 'blob', sha: null });
    const tree = await call('POST', '/git/trees', { base_tree: parent.treeSha, tree: entries });
    const made = await call('POST', '/git/commits', { message, tree: tree.sha, parents: [parent.commitSha] });
    try {
      await call('PATCH', `/git/refs/heads/${branch}`, { sha: made.sha, force: false });
    } catch (err) {
      if (err.status === 422 || err.status === 409) throw new ConflictError(explain(409), err.status);
      throw err;
    }
    return made.sha;
  }

  /**
   * Reads the current head, lets `build({ head, readText, listFiles })` decide the changes, commits them;
   * if someone pushed in between, rebuilds from the new head (up to `tries`).
   */
  async function change(build, message, tries = 3) {
    for (let attempt = 1; ; attempt += 1) {
      const parent = await head();
      const plan = await build({
        head: parent,
        readText: (p) => readText(p, parent.commitSha),
        listFiles: () => listFiles(parent.treeSha),
      });
      try {
        return { sha: await commit({ ...plan, message, parent }), plan };
      } catch (err) {
        if (!(err instanceof ConflictError) || attempt >= tries) throw err;
      }
    }
  }

  /** Read-only view of the repo at the current head (for previews). */
  async function snapshot() {
    const parent = await head();
    return { head: parent, readText: (p) => readText(p, parent.commitSha), listFiles: () => listFiles(parent.treeSha) };
  }

  return { head, listFiles, readText, commit, change, snapshot, ping: () => call('GET', '') };
}
