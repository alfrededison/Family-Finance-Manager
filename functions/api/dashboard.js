import { json, error } from '../_utils.js';

// GET /api/dashboard — single round-trip: KPIs + breakdowns + recent activity
export async function onRequestGet({ env }) {
  try {
    const [groupsRes, membersRes, assetsRes, txRes] = await Promise.all([
      env.DB.prepare('SELECT * FROM asset_groups WHERE active = 1 ORDER BY id').all(),
      env.DB.prepare('SELECT * FROM members ORDER BY id').all(),
      env.DB.prepare(`
        SELECT a.*, g.name AS group_name, g.icon AS group_icon, g.type AS group_type,
               m.name AS member_name, m.color AS member_color
        FROM assets a
        JOIN asset_groups g ON g.id = a.group_id
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

    const groups = groupsRes.results || [];
    const members = membersRes.results || [];
    const assets = (assetsRes.results || []).map(decorate);
    const transactions = txRes.results || [];

    let totalAsset = 0;
    let totalLiability = 0;
    let totalCost = 0;

    const byGroup = {};
    const byMember = {};

    for (const a of assets) {
      const isLiability = a.group_type === 'Liability';
      if (isLiability) totalLiability += a.value;
      else totalAsset += a.value;
      totalCost += a.cost;

      const gk = a.group_id;
      byGroup[gk] = byGroup[gk] || { id: gk, name: a.group_name, icon: a.group_icon, type: a.group_type, value: 0, cost: 0, count: 0 };
      byGroup[gk].value += a.value;
      byGroup[gk].cost += a.cost;
      byGroup[gk].count += 1;

      if (a.member_id) {
        const mk = a.member_id;
        byMember[mk] = byMember[mk] || { id: mk, name: a.member_name, color: a.member_color, value: 0, count: 0 };
        if (!isLiability) byMember[mk].value += a.value;
        else byMember[mk].value -= a.value;
        byMember[mk].count += 1;
      }
    }

    const netWorth = totalAsset - totalLiability;
    const pnl = totalAsset - totalCost;
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

    return json({
      kpi: {
        netWorth,
        totalAsset,
        totalLiability,
        totalCost,
        pnl,
        pnlPct,
      },
      groups,
      members,
      assets,
      transactions,
      breakdown: {
        byGroup: Object.values(byGroup).sort((a, b) => b.value - a.value),
        byMember: Object.values(byMember).sort((a, b) => b.value - a.value),
      },
    });
  } catch (err) {
    return error(err.message, 500);
  }
}

function decorate(a) {
  const value = (a.qty || 0) * (a.current_price || 0);
  const cost = (a.qty || 0) * (a.cost_price || 0);
  const pnl = value - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  return { ...a, value, cost, pnl, pnlPct };
}
