import { json, error, readBody } from '../_utils.js';

// GET /api/user-settings — per-user key/value store (integrations, etc.)
export async function onRequestGet({ env, data }) {
  try {
    const rows = await env.DB.prepare(
      'SELECT key, value FROM user_settings WHERE user_id = ?',
    ).bind(data.user.id).all();
    const out = {};
    for (const { key, value } of (rows.results || [])) {
      try { out[key] = JSON.parse(value); } catch { out[key] = value; }
    }
    return json(out);
  } catch (err) {
    return error(err.message, 500);
  }
}

// POST /api/user-settings { key, value } — upsert a single key for current user
export async function onRequestPost({ env, request, data }) {
  try {
    const { key, value } = await readBody(request);
    if (!key) return error('key required', 400);
    await env.DB.prepare(
      'INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)',
    ).bind(data.user.id, String(key), JSON.stringify(value)).run();
    return json({ ok: true, key });
  } catch (err) {
    return error(err.message, 500);
  }
}
