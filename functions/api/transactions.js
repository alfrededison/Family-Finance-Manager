import { json, error, readBody } from '../_utils.js';

// GET /api/transactions?member=&q=
export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url);
    const member = url.searchParams.get('member');
    const q = url.searchParams.get('q');

    const where = [];
    const params = [];
    if (member) { where.push('t.member_id = ?'); params.push(Number(member)); }
    if (q) { where.push('(a.name LIKE ? OR t.notes LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }

    const sql = `
      SELECT t.*, a.name AS asset_name, m.name AS member_name
      FROM transactions t
      JOIN assets a ON a.id = t.asset_id
      LEFT JOIN members m ON m.id = t.member_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY t.date DESC, t.id DESC
      LIMIT 500
    `;
    const stmt = env.DB.prepare(sql);
    const bound = params.length ? stmt.bind(...params) : stmt;
    const res = await bound.all();
    return json(res.results || []);
  } catch (err) {
    return error(err.message, 500);
  }
}

// POST /api/transactions
export async function onRequestPost({ env, request }) {
  try {
    const b = await readBody(request);
    if (!b.date || !b.type || !b.asset_id) return error('date, type, asset_id required', 400);

    const qty = Number(b.qty || 0);
    const unitPrice = Number(b.unit_price || 0);
    const total = b.total != null ? Number(b.total) : qty * unitPrice;

    const result = await env.DB.prepare(`
      INSERT INTO transactions (date, type, asset_id, member_id, qty, unit_price, total, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      b.date,
      b.type,
      Number(b.asset_id),
      b.member_id ? Number(b.member_id) : null,
      qty,
      unitPrice,
      total,
      b.notes || null,
    ).run();

    const id = result.meta.last_row_id;
    const row = await env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first();
    return json(row, 201);
  } catch (err) {
    return error(err.message, 500);
  }
}
