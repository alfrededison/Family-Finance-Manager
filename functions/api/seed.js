import { json, error } from '../_utils.js';

// POST /api/seed — idempotent: only seeds if asset_groups is empty
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

      env.DB.prepare("INSERT INTO asset_groups (id, name, icon, type, sort_order, active) VALUES ('dau-tu',   'Đầu tư',   '📈', 'Asset',     1, 1)"),
      env.DB.prepare("INSERT INTO asset_groups (id, name, icon, type, sort_order, active) VALUES ('tich-tru', 'Tích trữ', '🏆', 'Asset',     2, 1)"),
      env.DB.prepare("INSERT INTO asset_groups (id, name, icon, type, sort_order, active) VALUES ('cho-vay',  'Cho vay',  '🤝', 'Asset',     3, 1)"),
      env.DB.prepare("INSERT INTO asset_groups (id, name, icon, type, sort_order, active) VALUES ('di-vay',   'Đi vay',   '💳', 'Liability', 4, 1)"),
      env.DB.prepare("INSERT INTO asset_groups (id, name, icon, type, sort_order, active) VALUES ('tien-gui', 'Tiền gửi', '🏦', 'Asset',     5, 1)"),
      env.DB.prepare("INSERT INTO asset_groups (id, name, icon, type, sort_order, active) VALUES ('bank',     'Bank',     '🏧', 'Asset',     6, 1)"),

      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('dau-tu',   'Cổ phiếu')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('dau-tu',   'Coin')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('dau-tu',   'Trái phiếu')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('dau-tu',   'CCQ')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('tich-tru', 'USD')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('tich-tru', 'Vàng')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('tich-tru', 'BĐS')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('cho-vay',  'Cho vay nóng')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('cho-vay',  'Cho vay lâu dài')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('di-vay',   'Trả góp')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('di-vay',   'Vay nóng')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('di-vay',   'Vay lâu dài')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('tien-gui', 'TG cố định')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('tien-gui', 'TG linh hoạt')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('bank',     'TK tự do')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('bank',     'TK dài tháng')"),
      env.DB.prepare("INSERT INTO asset_subtypes (group_id, name) VALUES ('bank',     'TK ít tháng')"),

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
    ]);

    return json({ ok: true, seeded: true });
  } catch (err) {
    return error(err.message, 500);
  }
}
