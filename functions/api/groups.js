import { json, error, readBody } from '../_utils.js';

export async function onRequestGet({ env }) {
  try {
    const res = await env.DB.prepare('SELECT * FROM asset_groups WHERE active = 1 ORDER BY id').all();
    return json(res.results || []);
  } catch (err) {
    return error(err.message, 500);
  }
}

export async function onRequestPost({ env, request }) {
  try {
    const b = await readBody(request);
    if (!b.name) return error('name required', 400);

    const type = b.type === 'Liability' ? 'Liability' : 'Asset';
    const result = await env.DB.prepare(
      'INSERT INTO asset_groups (name, icon, type, active) VALUES (?, ?, ?, 1)'
    ).bind(b.name, b.icon || '📦', type).run();

    const id = result.meta.last_row_id;
    const row = await env.DB.prepare('SELECT * FROM asset_groups WHERE id = ?').bind(id).first();
    return json(row, 201);
  } catch (err) {
    return error(err.message, 500);
  }
}
