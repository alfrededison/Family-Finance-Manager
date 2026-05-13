import { json, error, readBody } from '../../../_utils.js';

// GET /api/groups/:id/subtypes
export async function onRequestGet({ env, params }) {
  try {
    const id = String(params.id);
    const res = await env.DB.prepare(
      'SELECT * FROM asset_subtypes WHERE group_id = ? ORDER BY name COLLATE NOCASE'
    ).bind(id).all();
    return json(res.results || []);
  } catch (err) {
    return error(err.message, 500);
  }
}

// POST /api/groups/:id/subtypes  { name }
export async function onRequestPost({ env, request, params }) {
  try {
    const id = String(params.id);
    const b = await readBody(request);
    const name = (b.name || '').trim();
    if (!name) return error('name required', 400);

    const result = await env.DB.prepare(
      'INSERT INTO asset_subtypes (group_id, name) VALUES (?, ?)'
    ).bind(id, name).run();

    const newId = result.meta.last_row_id;
    const row = await env.DB.prepare('SELECT * FROM asset_subtypes WHERE id = ?').bind(newId).first();
    return json(row, 201);
  } catch (err) {
    if (/UNIQUE/.test(err.message)) return error('Phân loại đã tồn tại', 409);
    return error(err.message, 500);
  }
}

// DELETE /api/groups/:id/subtypes?subId=
export async function onRequestDelete({ env, request, params }) {
  try {
    const id = String(params.id);
    const url = new URL(request.url);
    const subId = Number(url.searchParams.get('subId'));
    if (!subId) return error('invalid subId', 400);
    await env.DB.prepare(
      'DELETE FROM asset_subtypes WHERE id = ? AND group_id = ?'
    ).bind(subId, id).run();
    return json({ ok: true, id: subId });
  } catch (err) {
    return error(err.message, 500);
  }
}
