// Encrypts the GitHub token at rest with a password (PBKDF2-SHA256 -> AES-GCM, WebCrypto).
//
// This is NOT access control: the real gate is the token itself, enforced by GitHub. The password only
// stops someone with a copy of this browser's storage from reading the token. The decrypted token must
// live in a JS variable only, never in storage.

const VERSION = 1;
export const DEFAULT_ITERATIONS = 600_000;
const MIN_ITERATIONS = 200_000;
const MAX_ITERATIONS = 5_000_000;
const AAD_PREFIX = 'nursingtests-admin-vault';

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// The parameters are authenticated, so tampering with iterations/version makes decryption fail.
const aad = (iterations) => enc.encode(`${AAD_PREFIX}:v${VERSION}:${iterations}`);

/** Returns a JSON-safe object to store; contains no secret. */
export async function seal(secret, password, { iterations = DEFAULT_ITERATIONS } = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(iterations) },
    key,
    enc.encode(secret),
  );
  return { v: VERSION, iter: iterations, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

/** Throws the same error for a wrong password and for corrupted/tampered data. */
export async function open(sealed, password) {
  const fail = () => new Error('סיסמה שגויה או נתונים פגומים');
  if (!sealed || sealed.v !== VERSION || !Number.isInteger(sealed.iter)) throw fail();
  if (sealed.iter < MIN_ITERATIONS || sealed.iter > MAX_ITERATIONS) throw fail();
  try {
    const key = await deriveKey(password, fromB64(sealed.salt), sealed.iter);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(sealed.iv), additionalData: aad(sealed.iter) },
      key,
      fromB64(sealed.ct),
    );
    return dec.decode(plain);
  } catch {
    throw fail();
  }
}

/** Hebrew problems with a chosen password; empty when acceptable. */
export function passwordProblems(password) {
  const problems = [];
  if (password.length < 12) problems.push('לפחות 12 תווים');
  if (!/[A-Za-zא-ת]/.test(password) || !/\d/.test(password)) problems.push('גם אותיות וגם ספרות');
  if (new Set(password).size < 6) problems.push('יותר מדי תווים חוזרים');
  return problems;
}

/** Delay before the next unlock attempt is accepted (slows casual guessing; not a security boundary). */
export const backoffMs = (failures) => (failures < 3 ? 0 : Math.min(2 ** (failures - 3) * 1000, 60_000));

/** A GitHub fine-grained token looks like github_pat_…; classic ones like ghp_…. Rejects anything else. */
export const looksLikeToken = (t) => /^(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})$/.test(t.trim());
