import { json, error, readBody } from '../_utils.js';

export async function onRequestGet({ env, data }) {
  try {
    const res = await env.DB.prepare('SELECT * FROM members WHERE user_id = ? ORDER BY id')
      .bind(data.user.id).all();
    return json(res.results || []);
  } catch (err) {
    return error(err.message, 500);
  }
}

export async function onRequestPost({ env, request, data }) {
  try {
    const b = await readBody(request);
    if (!b.name) return error('name required', 400);

    const result = await env.DB.prepare(
      'INSERT INTO members (user_id, name, color) VALUES (?, ?, ?)'
    ).bind(data.user.id, b.name, b.color || '#3b82f6').run();

    const id = result.meta.last_row_id;
    const row = await env.DB.prepare('SELECT * FROM members WHERE id = ? AND user_id = ?')
      .bind(id, data.user.id).first();
    return json(row, 201);
  } catch (err) {
    return error(err.message, 500);
  }
}
