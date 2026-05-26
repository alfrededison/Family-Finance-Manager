import { json, error, computeAssetMetrics } from '../_utils.js';

// GET /api/dashboard — raw rows for the frontend to aggregate (kpi + breakdowns
// are computed client-side using the hard-coded group list in src/data/groups.js).
export async function onRequestGet({ env, data }) {
  try {
    const [membersRes, assetsRes] = await Promise.all([
      env.DB.prepare('SELECT * FROM members WHERE user_id = ? ORDER BY id').bind(data.user.id).all(),
      env.DB.prepare(`
        SELECT a.*, m.name AS member_name, m.color AS member_color
        FROM assets a
        LEFT JOIN members m ON m.id = a.member_id AND m.user_id = a.user_id
        WHERE a.status = 'active' AND a.user_id = ?
        ORDER BY a.id DESC
      `).bind(data.user.id).all(),
    ]);

    const members = membersRes.results || [];
    const assets = (assetsRes.results || []).map((a) => ({ ...a, ...computeAssetMetrics(a) }));

    return json({ members, assets });
  } catch (err) {
    return error(err.message, 500);
  }
}
