import { json, error } from '../_utils.js';

// POST /api/seed — idempotent: only seeds if DB is empty
export async function onRequestPost({ env }) {
  try {
    const existing = await env.DB.prepare('SELECT COUNT(*) AS c FROM asset_groups').first();
    if (existing && existing.c > 0) {
      return json({ ok: true, seeded: false, reason: 'already has data' });
    }

    await env.DB.batch([
      env.DB.prepare("INSERT INTO members (name, color) VALUES ('Tôi', '#3b82f6')"),
      env.DB.prepare("INSERT INTO members (name, color) VALUES ('Vợ', '#ec4899')"),
      env.DB.prepare("INSERT INTO members (name, color) VALUES ('Chung', '#8b5cf6')"),

      env.DB.prepare("INSERT INTO asset_groups (name, icon, type) VALUES ('Tiền mặt', '💵', 'Asset')"),
      env.DB.prepare("INSERT INTO asset_groups (name, icon, type) VALUES ('Tiền gửi', '🏦', 'Asset')"),
      env.DB.prepare("INSERT INTO asset_groups (name, icon, type) VALUES ('Cổ phiếu', '📈', 'Asset')"),
      env.DB.prepare("INSERT INTO asset_groups (name, icon, type) VALUES ('Crypto', '🪙', 'Asset')"),
      env.DB.prepare("INSERT INTO asset_groups (name, icon, type) VALUES ('Vàng', '🥇', 'Asset')"),
      env.DB.prepare("INSERT INTO asset_groups (name, icon, type) VALUES ('Bất động sản', '🏠', 'Asset')"),
      env.DB.prepare("INSERT INTO asset_groups (name, icon, type) VALUES ('Khác', '📦', 'Asset')"),
      env.DB.prepare("INSERT INTO asset_groups (name, icon, type) VALUES ('Vay nợ', '💳', 'Liability')"),
    ]);

    return json({ ok: true, seeded: true });
  } catch (err) {
    return error(err.message, 500);
  }
}
