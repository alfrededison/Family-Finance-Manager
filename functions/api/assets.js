import { json, error, readBody, nowISO, computeAssetMetrics, snapshotAssetFields, recordAssetDelta } from '../_utils.js';

// GET /api/assets?group=&member=&subtype=&q=
export async function onRequestGet({ env, request, data }) {
  try {
    const url = new URL(request.url);
    const group = url.searchParams.get('group');
    const member = url.searchParams.get('member');
    const subtype = url.searchParams.get('subtype');
    const q = url.searchParams.get('q');

    const where = ["a.status = 'active'", 'a.user_id = ?'];
    const params = [data.user.id];
    if (group)   { where.push('a.group_id = ?'); params.push(String(group)); }
    if (member)  { where.push('a.member_id = ?'); params.push(Number(member)); }
    if (subtype) { where.push('a.subtype = ?'); params.push(String(subtype)); }
    if (q)       { where.push('(a.name LIKE ? OR a.notes LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }

    const sql = `
      SELECT a.*, m.name AS member_name, m.color AS member_color
      FROM assets a
      LEFT JOIN members m ON m.id = a.member_id AND m.user_id = a.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.id DESC
    `;
    const res = await env.DB.prepare(sql).bind(...params).all();

    const rows = (res.results || []).map((a) => ({ ...a, ...computeAssetMetrics(a) }));

    return json(rows);
  } catch (err) {
    return error(err.message, 500);
  }
}

// POST /api/assets
export async function onRequestPost({ env, request, data }) {
  try {
    const b = await readBody(request);
    if (!b.name || !b.group_id) return error('name and group_id required', 400);

    const now = nowISO();
    const result = await env.DB.prepare(`
      INSERT INTO assets (
        user_id, name, group_id, subtype, member_id, qty, unit,
        cost_price, current_price,
        platform, term, maturity_date, bank,
        interest_rate, interest_tax_rate,
        interest_payment_day, interest_payment_cycle,
        start_date, notes, ticker,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      data.user.id,
      b.name,
      String(b.group_id),
      b.subtype || null,
      b.member_id ? Number(b.member_id) : null,
      Number(b.qty || 0),
      b.unit || null,
      Number(b.cost_price || 0),
      Number(b.current_price || b.cost_price || 0),
      b.platform || null,
      b.term || null,
      b.maturity_date || null,
      b.bank || null,
      b.interest_rate != null && b.interest_rate !== '' ? Number(b.interest_rate) : null,
      b.interest_tax_rate != null && b.interest_tax_rate !== '' ? Number(b.interest_tax_rate) : null,
      b.interest_payment_day != null && b.interest_payment_day !== '' ? Number(b.interest_payment_day) : null,
      b.interest_payment_cycle || null,
      b.start_date || null,
      b.notes || null,
      b.ticker || null,
      now,
      now,
    ).run();

    const id = result.meta.last_row_id;
    const row = await env.DB.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?')
      .bind(id, data.user.id).first();

    await recordAssetDelta(env, {
      assetId: id,
      type: 'create',
      changes: snapshotAssetFields(row),
      source: 'manual',
      note: b.notes || null,
      now,
    });

    return json(row, 201);
  } catch (err) {
    return error(err.message, 500);
  }
}
