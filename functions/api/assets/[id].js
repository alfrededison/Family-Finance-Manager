import { json, error, readBody, nowISO, diffAssetFields, snapshotAssetFields, recordAssetDelta } from '../../_utils.js';

const UPDATABLE_FIELDS = [
  'name', 'group_id', 'subtype', 'member_id', 'qty', 'unit',
  'cost_price', 'current_price',
  'platform', 'term', 'maturity_date', 'bank',
  'interest_rate', 'interest_tax_rate',
  'interest_payment_day', 'interest_payment_cycle',
  'interest_include_maturity',
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
    const after = {};
    for (const f of UPDATABLE_FIELDS) {
      if (b[f] !== undefined) {
        const v = b[f] === '' ? null : b[f];
        sets.push(`${f} = ?`);
        vals.push(v);
        after[f] = v;
      }
    }
    if (!sets.length) return error('no fields to update', 400);

    sets.push('updated_at = ?');
    vals.push(nowISO());
    vals.push(id);
    vals.push(data.user.id);

    // Read the full row before update so we can diff every changed field.
    const before = await env.DB.prepare(
      'SELECT * FROM assets WHERE id = ? AND user_id = ?',
    ).bind(id, data.user.id).first();
    if (!before) return error('not found', 404);

    const updateRes = await env.DB.prepare(
      `UPDATE assets SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
    ).bind(...vals).run();
    if ((updateRes.meta?.changes ?? 0) === 0) return error('not found', 404);

    // Record an edit delta for the fields that actually changed (skips no-ops).
    await recordAssetDelta(env, {
      assetId: id,
      type: 'edit',
      changes: diffAssetFields(before, after),
      source: b._source || 'manual',
      note: b.notes || null,
    });

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
    // Snapshot the full asset before delete so it can be restored later.
    const asset = await env.DB.prepare(
      'SELECT * FROM assets WHERE id = ? AND user_id = ?',
    ).bind(id, data.user.id).first();
    if (!asset) return error('not found', 404);

    await recordAssetDelta(env, {
      assetId: id,
      type: 'delete',
      changes: snapshotAssetFields(asset),
      source: 'manual',
      note: b?.notes || 'Đã xoá',
    });

    await env.DB.prepare(
      "UPDATE assets SET status = 'deleted', updated_at = ? WHERE id = ? AND user_id = ?",
    ).bind(nowISO(), id, data.user.id).run();
    return json({ ok: true, id });
  } catch (err) {
    return error(err.message, 500);
  }
}
