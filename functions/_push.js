// Web Push sender for Cloudflare Workers / Pages Functions.
// Implements VAPID (RFC 8292) auth and aes128gcm payload encryption (RFC 8291)
// using Web Crypto only — no Node dependencies, no npm web-push.

import { buildNotificationSummary } from './_notify.js';

// ─── base64url ──────────────────────────────────────────────────────────────

function b64urlEncode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  let s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concatBytes(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

// ─── VAPID JWT (ES256) ──────────────────────────────────────────────────────

async function importVapidPrivateKey(env) {
  const d   = b64urlDecode(env.VAPID_PRIVATE_KEY);
  const pub = b64urlDecode(env.VAPID_PUBLIC_KEY);  // 0x04 || x(32) || y(32)
  return crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256',
    d: b64urlEncode(d),
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    ext: true,
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function signVapidJwt(audience, env) {
  const header  = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT,
  };
  const enc = (o) => b64urlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const key = await importVapidPrivateKey(env);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64urlEncode(sig)}`;
}

// ─── aes128gcm payload encryption (RFC 8291) ────────────────────────────────

async function hkdf(salt, ikm, info, lengthBytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}

async function encryptPayload(payloadObj, subPubB64u, authB64u) {
  // 1. Generate ephemeral ECDH P-256 keypair.
  const eph = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  );
  const ephJwk = await crypto.subtle.exportKey('jwk', eph.publicKey);
  const ephPubRaw = concatBytes(
    new Uint8Array([0x04]),
    b64urlDecode(ephJwk.x),
    b64urlDecode(ephJwk.y),
  );

  // 2. Derive ECDH shared secret with subscriber's public key.
  const subPub = b64urlDecode(subPubB64u);  // 0x04 || x || y
  const subPubKey = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256',
    x: b64urlEncode(subPub.slice(1, 33)),
    y: b64urlEncode(subPub.slice(33, 65)),
    ext: true,
  }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subPubKey }, eph.privateKey, 256,
  );
  const sharedSecret = new Uint8Array(sharedBits);

  // 3. PRK_key = HKDF(salt=auth, IKM=shared_secret,
  //                   info="WebPush: info\0" || ua_public || as_public, L=32)
  const auth = b64urlDecode(authB64u);
  const keyInfo = concatBytes(
    new TextEncoder().encode('WebPush: info\0'),
    subPub,
    ephPubRaw,
  );
  const prkKey = await hkdf(auth, sharedSecret, keyInfo, 32);

  // 4. Per-message salt; derive CEK + nonce.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek   = await hkdf(salt, prkKey, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prkKey, new TextEncoder().encode('Content-Encoding: nonce\0'),    12);

  // 5. Plaintext + 0x02 (last record marker).
  const plaintext = concatBytes(
    new TextEncoder().encode(JSON.stringify(payloadObj)),
    new Uint8Array([0x02]),
  );

  // 6. AES-128-GCM encrypt.
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, cekKey, plaintext,
  ));

  // 7. Assemble body: salt(16) || rs(4 BE) || idlen(1) || keyid(idlen) || ciphertext.
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);  // record size 4096 — fits short payloads
  return concatBytes(salt, rs, new Uint8Array([ephPubRaw.length]), ephPubRaw, ct);
}

// ─── Send ───────────────────────────────────────────────────────────────────

async function sendOne(env, sub, payloadObj) {
  const url = new URL(sub.endpoint);
  const body = await encryptPayload(payloadObj, sub.p256dh, sub.auth);
  const jwt  = await signVapidJwt(`${url.protocol}//${url.host}`, env);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization':    `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type':     'application/octet-stream',
      'Content-Length':   String(body.length),
      'TTL':              '86400',
      'Urgency':          'normal',
    },
    body,
  });
}

export async function sendUserNotification(env, userId, payloadObj) {
  const { results: subs = [] } = await env.DB.prepare(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
  ).bind(userId).all();

  let sent = 0, removed = 0, failed = 0;
  for (const sub of subs) {
    try {
      const res = await sendOne(env, sub, payloadObj);
      if ([200, 201, 202].includes(res.status)) {
        sent++;
        await env.DB.prepare(
          'UPDATE push_subscriptions SET last_used_at = datetime("now") WHERE id = ?',
        ).bind(sub.id).run();
      } else if (res.status === 404 || res.status === 410) {
        await env.DB.prepare(
          'DELETE FROM push_subscriptions WHERE id = ?',
        ).bind(sub.id).run();
        removed++;
      } else {
        failed++;
        const text = await res.text().catch(() => '');
        console.warn(`push failed: sub=${sub.id} status=${res.status} body=${text.slice(0, 200)}`);
      }
    } catch (err) {
      failed++;
      console.warn(`push error: sub=${sub.id} ${err.message}`);
    }
  }
  return { sent, removed, failed };
}

// Compose + send daily summary for one user. forceTest=true sends a test
// payload even if the user has nothing maturing.
export async function sendDailyNotificationForUser(env, userId, opts = {}) {
  if (opts.forceTest) {
    const r = await sendUserNotification(env, userId, {
      title: '🔔 Test notification',
      body:  'Push notifications hoạt động bình thường!',
      url:   '/#/assets',
      tag:   'test',
    });
    return { ...r, kind: 'test' };
  }
  const summary = await buildNotificationSummary(env, userId);
  if (summary.count === 0) return { sent: 0, removed: 0, failed: 0, skipped: 'no items' };
  const r = await sendUserNotification(env, userId, {
    title: summary.title,
    body:  summary.body,
    url:   summary.url,
  });
  return { ...r, kind: 'daily', count: summary.count };
}
