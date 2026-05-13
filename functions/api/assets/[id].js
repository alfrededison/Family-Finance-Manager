import { json, error, readBody, nowISO } from '../../_utils.js';

// PUT /api/assets/:id — partial update
export async function onRequestPut({ env, request, params }) {
  try {
    const id = Number(params.id);
    if (!id) return error('invalid id', 400);

    const b = await readBody(request);

    const fields = [
      'name', 'group_id', 'subtype', 'member_id', 'qty', 'unit',
      'cost_price', 'current_price', 'start_date', 'end_date', 'rate', 'notes', 'status',
    ];
    const sets = [];
    const vals = [];
    for (const f of fields) {
      if (b[f] !== undefined) {
        sets.push(`${f} = ?`);
        vals.push(b[f]);
      }
    }
    if (!sets.length) return error('no fields to update', 400);

    sets.push('updated_at = ?');
    vals.push(nowISO());
    vals.push(id);

    await env.DB.prepare(`UPDATE assets SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

    // Track price history if current_price changed
    if (b.current_price !== undefined) {
      await env.DB.prepare(
        'INSERT INTO price_history (asset_id, price, recorded_at, source) VALUES (?, ?, ?, ?)'
      ).bind(id, Number(b.current_price), nowISO(), b._source || 'manual').run();
    }

    const row = await env.DB.prepare('SELECT * FROM assets WHERE id = ?').bind(id).first();
    return json(row);
  } catch (err) {
    return error(err.message, 500);
  }
}

// DELETE /api/assets/:id — soft delete
export async function onRequestDelete({ env, params }) {
  try {
    const id = Number(params.id);
    if (!id) return error('invalid id', 400);

    await env.DB.prepare("UPDATE assets SET status = 'deleted', updated_at = ? WHERE id = ?")
      .bind(nowISO(), id).run();
    return json({ ok: true, id });
  } catch (err) {
    return error(err.message, 500);
  }
}
