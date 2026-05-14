import { json, error } from '../_utils.js';

// POST /api/seed — idempotent: only seeds if members table is empty.
// Asset groups + subtypes are hard-coded in src/data/groups.js (no DB seed).
export async function onRequestPost({ env }) {
  try {
    const existing = await env.DB.prepare('SELECT COUNT(*) AS c FROM members').first();
    if (existing && existing.c > 0) {
      return json({ ok: true, seeded: false, reason: 'already has data' });
    }

    await env.DB.batch([
      env.DB.prepare("INSERT INTO members (name, color) VALUES ('Tôi', '#3b82f6')"),
      env.DB.prepare("INSERT INTO members (name, color) VALUES ('Vợ', '#ec4899')"),
      env.DB.prepare("INSERT INTO members (name, color) VALUES ('Chung', '#8b5cf6')"),

      env.DB.prepare("INSERT INTO platforms (name) VALUES ('Topi')"),
      env.DB.prepare("INSERT INTO platforms (name) VALUES ('Sstock')"),
      env.DB.prepare("INSERT INTO platforms (name) VALUES ('Techcombank')"),
      env.DB.prepare("INSERT INTO platforms (name) VALUES ('BIDV')"),
      env.DB.prepare("INSERT INTO platforms (name) VALUES ('Vietcombank')"),
      env.DB.prepare("INSERT INTO platforms (name) VALUES ('ACB')"),
      env.DB.prepare("INSERT INTO platforms (name) VALUES ('MB Bank')"),
      env.DB.prepare("INSERT INTO platforms (name) VALUES ('VPBank')"),
      env.DB.prepare("INSERT INTO platforms (name) VALUES ('VIB')"),
      env.DB.prepare("INSERT INTO platforms (name) VALUES ('TPBank')"),

      env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('market.provider.vang', '\"doji\"')"),
      env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('market.provider.usd', '\"tygiausd\"')"),
      env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('market.schedule.time', '\"17:00\"')"),
      env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('market.schedule.enabled', 'true')"),
    ]);

    return json({ ok: true, seeded: true });
  } catch (err) {
    return error(err.message, 500);
  }
}
