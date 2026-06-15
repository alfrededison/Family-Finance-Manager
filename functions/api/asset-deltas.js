import { json, error } from '../_utils.js';

// GET /api/asset-deltas?asset=&type=&source=&page=1&limit=50
// `source` accepts a category: 'manual' | 'sync' | 'market'.
export async function onRequestGet({ env, request, data }) {
  try {
    const url = new URL(request.url);
    const asset  = url.searchParams.get('asset');
    const type   = url.searchParams.get('type');
    const source = url.searchParams.get('source');
    const page  = Math.max(1, Number(url.searchParams.get('page') || 1));
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)));
    const offset = (page - 1) * limit;

    const where = ['a.user_id = ?'];
    const params = [data.user.id];
    if (asset) { where.push('ad.asset_id = ?'); params.push(Number(asset)); }
    if (type)  { where.push('ad.type = ?');     params.push(type); }
    if (source === 'manual') { where.push('ad.source = ?');    params.push('manual'); }
    else if (source)         { where.push('ad.source LIKE ?'); params.push(`${source}:%`); }

    const whereSQL = 'WHERE ' + where.join(' AND ');

    const [dataRes, countRes] = await Promise.all([
      env.DB.prepare(`
        SELECT ad.id, ad.asset_id, ad.type, ad.changes, ad.recorded_at, ad.source, ad.note,
               a.name AS asset_name, a.group_id AS asset_group
        FROM asset_deltas ad
        JOIN assets a ON a.id = ad.asset_id
        ${whereSQL}
        ORDER BY ad.recorded_at DESC, ad.id DESC
        LIMIT ? OFFSET ?
      `).bind(...params, limit, offset).all(),
      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM asset_deltas ad
        JOIN assets a ON a.id = ad.asset_id
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
