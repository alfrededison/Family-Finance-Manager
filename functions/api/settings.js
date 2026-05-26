import { json, error, readBody } from '../_utils.js';
import { SETTINGS_DEFAULTS } from './_providers.js';

// GET /api/settings — returns all settings merged with defaults
export async function onRequestGet({ env }) {
  try {
    const rows = await env.DB.prepare('SELECT key, value FROM settings').all();
    const result = { ...SETTINGS_DEFAULTS };
    for (const { key, value } of (rows.results || [])) {
      try { result[key] = JSON.parse(value); } catch { result[key] = value; }
    }
    return json(result);
  } catch (err) {
    return error(err.message, 500);
  }
}

// POST /api/settings { key, value } — upsert a single GLOBAL setting.
// Per-user settings (integration.* etc.) live in /api/user-settings.
export async function onRequestPost({ env, request }) {
  try {
    const { key, value } = await readBody(request);
    if (!key) return error('key required', 400);
    if (String(key).startsWith('integration.')) {
      return error('integration.* settings belong in /api/user-settings', 400);
    }
    await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .bind(String(key), JSON.stringify(value)).run();
    return json({ ok: true, key });
  } catch (err) {
    return error(err.message, 500);
  }
}
