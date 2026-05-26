import { json, error } from '../_utils.js';

// GET /api/snapshots?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns all snapshot rows in range for the current user, ordered by snapshot_date asc.
// Default range: last 2 years up to today.
export async function onRequestGet({ env, request, data }) {
  try {
    const url = new URL(request.url);
    const to   = url.searchParams.get('to')   || new Date().toISOString().slice(0, 10);
    const from = url.searchParams.get('from') || new Date(Date.now() - 2 * 365 * 86400000).toISOString().slice(0, 10);

    const res = await env.DB.prepare(`
      SELECT snapshot_date, group_id, subtype, value, cost, asset_count
      FROM asset_snapshots
      WHERE user_id = ? AND snapshot_date >= ? AND snapshot_date <= ?
      ORDER BY snapshot_date ASC, group_id ASC, subtype ASC
    `).bind(data.user.id, from, to).all();

    return json(res.results || [], 200);
  } catch (err) {
    return error(err.message, 500);
  }
}
