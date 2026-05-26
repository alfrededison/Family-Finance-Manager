// Self-hosted email/password auth utilities.
// PBKDF2-SHA256 hashing via Web Crypto (no WASM/deps). Opaque session tokens in D1.

// Cloudflare Workers' workerd caps PBKDF2 at 100k iterations.
const PBKDF2_ITER = 100_000;
const PBKDF2_HASH = 'SHA-256';
const KEY_BITS    = 256;
const SALT_BYTES  = 16;

const SESSION_DAYS     = 30;
const COOKIE_NAME      = 'sid';
const REFRESH_AFTER_MS = 24 * 3600 * 1000;

// Dummy hash used to equalize timing when the email lookup misses.
const DUMMY_HASH = 'v1:100000:AAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// ─── Base64url ──────────────────────────────────────────────────────────────

function b64urlEncode(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ─── PBKDF2 ─────────────────────────────────────────────────────────────────

async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter, hash: PBKDF2_HASH },
    key, KEY_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, PBKDF2_ITER);
  return `v1:${PBKDF2_ITER}:${b64urlEncode(salt)}:${b64urlEncode(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [v, iterStr, saltB64, hashB64] = String(stored || '').split(':');
  if (v !== 'v1') return false;
  const iter = Number(iterStr);
  if (!Number.isFinite(iter) || iter < 1) return false;
  const salt = b64urlDecode(saltB64);
  const expected = b64urlDecode(hashB64);
  const actual = await pbkdf2(password, salt, iter);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export const DUMMY_PASSWORD_HASH = DUMMY_HASH;

// ─── Sessions ───────────────────────────────────────────────────────────────

export async function createSession(env, userId, request) {
  const token = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const now = new Date();
  const exp = new Date(now.getTime() + SESSION_DAYS * 86400000);
  const ua = request?.headers.get('user-agent')?.slice(0, 255) ?? null;
  const ip = request?.headers.get('cf-connecting-ip') ?? null;
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(token, userId, now.toISOString(), exp.toISOString(), ua, ip).run();
  return token;
}

function readCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

export function readSessionCookie(request) {
  return readCookie(request, COOKIE_NAME);
}

export async function getSessionUser(request, env) {
  const token = readSessionCookie(request);
  if (!token) return null;
  const row = await env.DB.prepare(`
    SELECT s.id AS sid, s.expires_at, s.created_at AS s_created,
           u.id, u.email, u.name
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).bind(token).first();
  if (!row) return null;

  if (new Date(row.expires_at) < new Date()) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
    return null;
  }

  // Sliding refresh: bump expires_at if the session is older than 24h.
  const ageMs = Date.now() - new Date(row.s_created).getTime();
  if (ageMs > REFRESH_AFTER_MS) {
    const newExp = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').bind(newExp, token).run();
  }

  return { id: row.id, email: row.email, name: row.name, sessionId: row.sid };
}

export async function destroySession(env, token) {
  if (!token) return;
  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
}

// ─── Cookie headers ─────────────────────────────────────────────────────────
// Secure flag is conditional on the request scheme. Safari silently drops
// Secure cookies set over plain HTTP — even on localhost — which breaks the
// dev login flow. Cloudflare Pages always serves HTTPS in production, so this
// degrades only in `wrangler pages dev` over HTTP.

function cookieAttrs(request) {
  const isHttps = !!request && new URL(request.url).protocol === 'https:';
  return `Path=/; HttpOnly${isHttps ? '; Secure' : ''}; SameSite=Lax`;
}

export function setSessionCookie(token, request) {
  const maxAge = SESSION_DAYS * 86400;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieAttrs(request)}; Max-Age=${maxAge}`;
}

export function clearSessionCookie(request) {
  return `${COOKIE_NAME}=; ${cookieAttrs(request)}; Max-Age=0`;
}
