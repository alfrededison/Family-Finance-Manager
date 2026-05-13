import { json, error, readBody, nowISO } from '../_utils.js';

// GET /api/assets?group=&member=&q=
export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url);
    const group = url.searchParams.get('group');
    const member = url.searchParams.get('member');
    const q = url.searchParams.get('q');

    const where = ["a.status = 'active'"];
    const params = [];
    if (group) { where.push('a.group_id = ?'); params.push(Number(group)); }
    if (member) { where.push('a.member_id = ?'); params.push(Number(member)); }
    if (q) { where.push('(a.name LIKE ? OR a.notes LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }

    const sql = `
      SELECT a.*, g.name AS group_name, g.icon AS group_icon, g.type AS group_type,
             m.name AS member_name, m.color AS member_color
      FROM assets a
      JOIN asset_groups g ON g.id = a.group_id
      LEFT JOIN members m ON m.id = a.member_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.id DESC
    `;
    const stmt = env.DB.prepare(sql);
    const bound = params.length ? stmt.bind(...params) : stmt;
    const res = await bound.all();

    const rows = (res.results || []).map((a) => {
      const value = (a.qty || 0) * (a.current_price || 0);
      const cost = (a.qty || 0) * (a.cost_price || 0);
      const pnl = value - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      return { ...a, value, cost, pnl, pnlPct };
    });

    return json(rows);
  } catch (err) {
    return error(err.message, 500);
  }
}

// POST /api/assets
export async function onRequestPost({ env, request }) {
  try {
    const b = await readBody(request);
    if (!b.name || !b.group_id) return error('name and group_id required', 400);

    const now = nowISO();
    const result = await env.DB.prepare(`
      INSERT INTO assets (name, group_id, subtype, member_id, qty, unit, cost_price, current_price, start_date, end_date, rate, notes, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      b.name,
      Number(b.group_id),
      b.subtype || null,
      b.member_id ? Number(b.member_id) : null,
      Number(b.qty || 0),
      b.unit || null,
      Number(b.cost_price || 0),
      Number(b.current_price || b.cost_price || 0),
      b.start_date || null,
      b.end_date || null,
      b.rate != null ? Number(b.rate) : null,
      b.notes || null,
      now,
      now,
    ).run();

    const id = result.meta.last_row_id;
    const row = await env.DB.prepare('SELECT * FROM assets WHERE id = ?').bind(id).first();
    return json(row, 201);
  } catch (err) {
    return error(err.message, 500);
  }
}
