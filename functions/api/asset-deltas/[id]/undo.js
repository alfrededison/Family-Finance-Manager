import {
  json, error, readBody, nowISO,
  DELTA_FIELDS, diffAssetFields, snapshotAssetFields, recordAssetDelta,
} from '../../../_utils.js';

const TYPE_LABEL = { create: 'tạo mới', edit: 'cập nhật', delete: 'xoá' };
// Whitelist for field names interpolated into the UPDATE statement.
const ALLOWED_FIELDS = new Set(DELTA_FIELDS);

// POST /api/asset-deltas/:id/undo — revert one history entry.
//   create → soft delete the asset (same as deleting it)
//   edit   → put the recorded `old` values back
//   delete → reactivate the asset with the attributes it had when deleted
// Always records a new delta describing the undo (with the caller's note).
export async function onRequestPost({ env, request, params, data }) {
  try {
    const id = Number(params.id);
    if (!id) return error('invalid id', 400);

    const b = await readBody(request);

    const delta = await env.DB.prepare(`
      SELECT ad.id, ad.asset_id, ad.type, ad.changes
      FROM asset_deltas ad
      JOIN assets a ON a.id = ad.asset_id
      WHERE ad.id = ? AND a.user_id = ?
    `).bind(id, data.user.id).first();
    if (!delta) return error('not found', 404);

    const asset = await env.DB.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?')
      .bind(delta.asset_id, data.user.id).first();
    if (!asset) return error('not found', 404);

    let changes;
    try { changes = JSON.parse(delta.changes || '[]'); } catch { changes = []; }
    if (!Array.isArray(changes)) changes = [];

    const now = nowISO();
    const userNote = typeof b?.notes === 'string' ? b.notes.trim() : '';
    const note = [`Hoàn tác ${TYPE_LABEL[delta.type] || delta.type} (#${delta.id})`, userNote]
      .filter(Boolean).join(' — ');

    if (delta.type === 'create') {
      if (asset.status === 'deleted') return error('Tài sản đã bị xoá', 409);
      await recordAssetDelta(env, {
        assetId: asset.id,
        type: 'delete',
        changes: snapshotAssetFields(asset),
        note,
        now,
      });
      await env.DB.prepare(
        "UPDATE assets SET status = 'deleted', updated_at = ? WHERE id = ? AND user_id = ?",
      ).bind(now, asset.id, data.user.id).run();
      return json({ ok: true, asset_id: asset.id, type: 'delete' });
    }

    // 'edit' reverts to `old`; 'delete' restores the snapshot taken at delete time (`new`).
    const target = {};
    for (const c of changes) {
      if (!ALLOWED_FIELDS.has(c?.field)) continue;
      const v = delta.type === 'edit' ? c.old : c.new;
      target[c.field] = v === '' || v === undefined ? null : v;
    }

    const sets = Object.keys(target).map((f) => `${f} = ?`);
    const vals = Object.keys(target).map((f) => target[f]);

    if (delta.type === 'delete') {
      if (asset.status !== 'deleted') return error('Tài sản đang hoạt động', 409);
      sets.push("status = 'active'");
    } else if (!sets.length) {
      return error('không có gì để hoàn tác', 400);
    }

    sets.push('updated_at = ?');
    vals.push(now);

    await env.DB.prepare(
      `UPDATE assets SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
    ).bind(...vals, asset.id, data.user.id).run();

    const row = await env.DB.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?')
      .bind(asset.id, data.user.id).first();

    const undoType = delta.type === 'delete' ? 'create' : 'edit';
    await recordAssetDelta(env, {
      assetId: asset.id,
      type: undoType,
      changes: undoType === 'create' ? snapshotAssetFields(row) : diffAssetFields(asset, target),
      note,
      now,
    });

    return json({ ok: true, asset_id: asset.id, type: undoType });
  } catch (err) {
    return error(err.message, 500);
  }
}
