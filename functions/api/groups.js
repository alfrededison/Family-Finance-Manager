import { json, error, readBody } from '../_utils.js';

// GET /api/groups — active groups with their subtypes
export async function onRequestGet({ env }) {
  try {
    const [groupsRes, subtypesRes] = await Promise.all([
      env.DB.prepare('SELECT * FROM asset_groups WHERE active = 1 ORDER BY sort_order, id').all(),
      env.DB.prepare('SELECT id, group_id, name FROM asset_subtypes ORDER BY name COLLATE NOCASE').all(),
    ]);
    const subs = subtypesRes.results || [];
    const byGroup = subs.reduce((acc, s) => {
      (acc[s.group_id] = acc[s.group_id] || []).push(s);
      return acc;
    }, {});
    const groups = (groupsRes.results || []).map((g) => ({ ...g, subtypes: byGroup[g.id] || [] }));
    return json(groups);
  } catch (err) {
    return error(err.message, 500);
  }
}

// POST /api/groups  { id?, name, icon, type }
export async function onRequestPost({ env, request }) {
  try {
    const b = await readBody(request);
    if (!b.name) return error('name required', 400);

    const id = (b.id && String(b.id).trim()) || slugify(b.name);
    if (!id) return error('cannot derive id', 400);

    const type = b.type === 'Liability' ? 'Liability' : 'Asset';
    const icon = b.icon || '📦';

    const maxRow = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM asset_groups').first();
    const sortOrder = (maxRow?.m || 0) + 1;

    await env.DB.prepare(
      'INSERT INTO asset_groups (id, name, icon, type, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)'
    ).bind(id, b.name, icon, type, sortOrder).run();

    const row = await env.DB.prepare('SELECT * FROM asset_groups WHERE id = ?').bind(id).first();
    return json(row, 201);
  } catch (err) {
    if (/UNIQUE|PRIMARY/.test(err.message)) return error('Nhóm đã tồn tại', 409);
    return error(err.message, 500);
  }
}

// DELETE /api/groups?id=  — soft deactivate
export async function onRequestDelete({ env, request }) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return error('id required', 400);
    await env.DB.prepare('UPDATE asset_groups SET active = 0 WHERE id = ?').bind(id).run();
    return json({ ok: true, id });
  } catch (err) {
    return error(err.message, 500);
  }
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
