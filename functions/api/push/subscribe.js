import { json, error, readBody } from '../../_utils.js';

// POST /api/push/subscribe   { endpoint, keys: { p256dh, auth }, label? }
// Upsert the current user's subscription for this endpoint.
export async function onRequestPost({ env, request, data }) {
  try {
    const { endpoint, keys = {}, label } = await readBody(request);
    if (!endpoint || !keys.p256dh || !keys.auth) {
      return error('endpoint + keys.p256dh + keys.auth required', 400);
    }
    await env.DB.prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, label)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, endpoint) DO UPDATE SET
        p256dh = excluded.p256dh,
        auth   = excluded.auth,
        label  = excluded.label
    `).bind(data.user.id, endpoint, keys.p256dh, keys.auth, label || null).run();
    return json({ ok: true });
  } catch (err) {
    return error(err.message, 500);
  }
}

// DELETE /api/push/subscribe?endpoint=…
export async function onRequestDelete({ env, request, data }) {
  try {
    const url = new URL(request.url);
    const endpoint = url.searchParams.get('endpoint');
    if (!endpoint) return error('endpoint query required', 400);
    await env.DB.prepare(
      'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
    ).bind(data.user.id, endpoint).run();
    return json({ ok: true });
  } catch (err) {
    return error(err.message, 500);
  }
}
