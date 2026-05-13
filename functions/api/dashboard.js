import { json, error, computeAssetMetrics } from '../_utils.js';

// GET /api/dashboard — raw rows for the frontend to aggregate (kpi + breakdowns
// are computed client-side using the hard-coded group list in src/data/groups.js).
export async function onRequestGet({ env }) {
  try {
    const [membersRes, assetsRes, txRes] = await Promise.all([
      env.DB.prepare('SELECT * FROM members ORDER BY id').all(),
      env.DB.prepare(`
        SELECT a.*, m.name AS member_name, m.color AS member_color
        FROM assets a
        LEFT JOIN members m ON m.id = a.member_id
        WHERE a.status = 'active'
        ORDER BY a.id DESC
      `).all(),
      env.DB.prepare(`
        SELECT t.*, a.name AS asset_name, m.name AS member_name
        FROM transactions t
        JOIN assets a ON a.id = t.asset_id
        LEFT JOIN members m ON m.id = t.member_id
        ORDER BY t.date DESC, t.id DESC
        LIMIT 20
      `).all(),
    ]);

    const members = membersRes.results || [];
    const assets = (assetsRes.results || []).map((a) => ({ ...a, ...computeAssetMetrics(a) }));
    const transactions = txRes.results || [];

    return json({ members, assets, transactions });
  } catch (err) {
    return error(err.message, 500);
  }
}
