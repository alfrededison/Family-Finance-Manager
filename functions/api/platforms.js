import { json, error, readBody } from '../_utils.js';

// GET /api/platforms
export async function onRequestGet({ env }) {
  try {
    const res = await env.DB.prepare('SELECT * FROM platforms ORDER BY name COLLATE NOCASE').all();
    return json(res.results || []);
  } catch (err) {
    return error(err.message, 500);
  }
}

// POST /api/platforms  { name }
export async function onRequestPost({ env, request }) {
  try {
    const b = await readBody(request);
    const name = (b.name || '').trim();
    if (!name) return error('name required', 400);

    const result = await env.DB.prepare(
      'INSERT INTO platforms (name) VALUES (?)'
    ).bind(name).run();

    const id = result.meta.last_row_id;
    const row = await env.DB.prepare('SELECT * FROM platforms WHERE id = ?').bind(id).first();
    return json(row, 201);
  } catch (err) {
    if (/UNIQUE/.test(err.message)) return error('Nền tảng đã tồn tại', 409);
    return error(err.message, 500);
  }
}

// DELETE /api/platforms?id=
export async function onRequestDelete({ env, request }) {
  try {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get('id'));
    if (!id) return error('invalid id', 400);
    await env.DB.prepare('DELETE FROM platforms WHERE id = ?').bind(id).run();
    return json({ ok: true, id });
  } catch (err) {
    return error(err.message, 500);
  }
}
