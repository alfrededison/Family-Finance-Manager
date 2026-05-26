import { json, error, readBody, nowISO } from '../../_utils.js';

const UPDATABLE_FIELDS = [
  'name', 'group_id', 'subtype', 'member_id', 'qty', 'unit',
  'cost_price', 'current_price',
  'platform', 'term', 'maturity_date', 'bank',
  'interest_rate', 'interest_tax_rate',
  'interest_payment_day', 'interest_payment_cycle',
  'start_date', 'notes', 'ticker', 'status',
];

// PUT /api/assets/:id — partial update
export async function onRequestPut({ env, request, params, data }) {
  try {
    const id = Number(params.id);
    if (!id) return error('invalid id', 400);

    const b = await readBody(request);

    const sets = [];
    const vals = [];
    for (const f of UPDATABLE_FIELDS) {
      if (b[f] !== undefined) {
        sets.push(`${f} = ?`);
        vals.push(b[f] === '' ? null : b[f]);
      }
    }
    if (!sets.length) return error('no fields to update', 400);

    sets.push('updated_at = ?');
    vals.push(nowISO());
    vals.push(id);
    vals.push(data.user.id);

    // Read old price before update so we can store it in history.
    let oldPrice = null;
    if (b.current_price !== undefined && b.current_price !== null && b.current_price !== '') {
      const prev = await env.DB.prepare(
        'SELECT current_price FROM assets WHERE id = ? AND user_id = ?',
      ).bind(id, data.user.id).first();
      if (!prev) return error('not found', 404);
      oldPrice = prev.current_price ?? null;
    }

    const updateRes = await env.DB.prepare(
      `UPDATE assets SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
    ).bind(...vals).run();
    if ((updateRes.meta?.changes ?? 0) === 0) return error('not found', 404);

    // Track history when current_price changes.
    if (b.current_price !== undefined && b.current_price !== null && b.current_price !== '') {
      await env.DB.prepare(
        'INSERT INTO price_history (asset_id, price, old_price, recorded_at, source, type, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, Number(b.current_price), oldPrice, nowISO(), b._source || 'manual', 'edit', b.notes || null).run();
    }

    const row = await env.DB.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?')
      .bind(id, data.user.id).first();
    return json(row);
  } catch (err) {
    return error(err.message, 500);
  }
}

// DELETE /api/assets/:id — soft delete
export async function onRequestDelete({ env, params, request, data }) {
  try {
    const id = Number(params.id);
    if (!id) return error('invalid id', 400);

    const b = await readBody(request);
    const asset = await env.DB.prepare(
      'SELECT current_price FROM assets WHERE id = ? AND user_id = ?',
    ).bind(id, data.user.id).first();
    if (!asset) return error('not found', 404);

    await env.DB.prepare(
      'INSERT INTO price_history (asset_id, price, recorded_at, source, type, note) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, asset.current_price, nowISO(), 'manual', 'delete', b?.notes || 'Đã xoá').run();

    await env.DB.prepare(
      "UPDATE assets SET status = 'deleted', updated_at = ? WHERE id = ? AND user_id = ?",
    ).bind(nowISO(), id, data.user.id).run();
    return json({ ok: true, id });
  } catch (err) {
    return error(err.message, 500);
  }
}
