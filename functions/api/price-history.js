import { json, error } from '../_utils.js';

// GET /api/price-history?asset=&type=&page=1&limit=50
export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url);
    const asset = url.searchParams.get('asset');
    const type  = url.searchParams.get('type');
    const page  = Math.max(1, Number(url.searchParams.get('page') || 1));
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)));
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];
    if (asset) { where.push('ph.asset_id = ?'); params.push(Number(asset)); }
    if (type)  { where.push('ph.type = ?');     params.push(type); }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [dataRes, countRes] = await Promise.all([
      env.DB.prepare(`
        SELECT ph.id, ph.asset_id, ph.price, ph.old_price, ph.recorded_at, ph.source, ph.type, ph.note,
               a.name AS asset_name, a.group_id AS asset_group
        FROM price_history ph
        JOIN assets a ON a.id = ph.asset_id
        ${whereSQL}
        ORDER BY ph.recorded_at DESC, ph.id DESC
        LIMIT ? OFFSET ?
      `).bind(...params, limit, offset).all(),
      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM price_history ph
        ${whereSQL}
      `).bind(...params).first(),
    ]);

    return json({
      rows: dataRes.results || [],
      total: countRes?.total ?? 0,
      page,
      limit,
    });
  } catch (err) {
    return error(err.message, 500);
  }
}
