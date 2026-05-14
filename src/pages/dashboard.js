import { api } from '../api.js';
import { fmtVND, fmtPct, escapeHtml } from '../main.js';
import { findGroup, findSubtype } from '../data/groups.js';

// Stable per-group colors so slices keep the same color across renders.
const GROUP_COLORS = {
  'dau-tu':   '#3b82f6',
  'tich-tru': '#f59e0b',
  'cho-vay':  '#10b981',
  'di-vay':   '#ef4444',
  'tien-gui': '#8b5cf6',
  'bank':     '#06b6d4',
};
const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

// Module-level state for drill-down. Reset on each fresh page load.
let _data = null;
let _viewEl = null;
let _selectedGroup = null;
let _selectedMember = null;

export async function renderDashboard(view) {
  _data = await api.get('/dashboard');
  _viewEl = view;
  _selectedGroup = null;
  _selectedMember = null;
  paint();
}

function paint() {
  const { assets, members } = _data;
  const { kpi, byGroup, byMember } = aggregate(assets, members);

  const groupSection = _selectedGroup
    ? renderGroupDrilldown(assets, _selectedGroup)
    : renderGroupChart(byGroup);

  const memberSection = _selectedMember
    ? renderMemberDrilldown(assets, members, _selectedMember)
    : renderMemberChart(byMember);

  _viewEl.innerHTML = `
    <div class="page-header"><h1>📊 Tổng quan</h1></div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="label">Tài sản ròng</div>
        <div class="value ${kpi.netWorth >= 0 ? 'pos' : 'neg'}">${fmtVND(kpi.netWorth)}</div>
        <div class="sub">Tổng tài sản − Nợ phải trả</div>
      </div>
      <div class="kpi-card">
        <div class="label">Tổng tài sản</div>
        <div class="value">${fmtVND(kpi.totalAsset)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Nợ phải trả</div>
        <div class="value">${fmtVND(kpi.totalLiability)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Lãi/Lỗ chưa thực hiện</div>
        <div class="value ${kpi.pnl >= 0 ? 'pos' : 'neg'}">${fmtVND(kpi.pnl)}</div>
        <div class="sub ${kpi.pnl >= 0 ? 'pos' : 'neg'}">${fmtPct(kpi.pnlPct)}</div>
      </div>
    </div>

    <div class="section" data-section="group">${groupSection}</div>
    <div class="section" data-section="member">${memberSection}</div>
  `;

  wireEvents();
}

function wireEvents() {
  _viewEl.querySelectorAll('[data-pie-click="group"]').forEach((el) => {
    el.addEventListener('click', () => {
      _selectedGroup = el.dataset.key;
      paint();
    });
  });
  _viewEl.querySelectorAll('[data-pie-click="member"]').forEach((el) => {
    el.addEventListener('click', () => {
      _selectedMember = el.dataset.key;
      paint();
    });
  });
  _viewEl.querySelectorAll('[data-back="group"]').forEach((el) => {
    el.addEventListener('click', () => { _selectedGroup = null; paint(); });
  });
  _viewEl.querySelectorAll('[data-back="member"]').forEach((el) => {
    el.addEventListener('click', () => { _selectedMember = null; paint(); });
  });
}

// ─── Chart blocks ───────────────────────────────────────────────────────────

function renderGroupChart(byGroup) {
  const slices = byGroup.map((g) => ({
    key: g.id,
    name: `${g.icon} ${g.name}`,
    value: Math.abs(g.value),
    color: GROUP_COLORS[g.id] || PALETTE[0],
    count: g.count,
  }));
  return `
    <h2>Phân bổ theo nhóm</h2>
    ${renderPie(slices, 'group', 'Chưa có dữ liệu')}
  `;
}

function renderGroupDrilldown(assets, groupId) {
  const g = findGroup(groupId);
  const groupAssets = (assets || []).filter((a) => a.group_id === groupId);

  const bySub = {};
  for (const a of groupAssets) {
    const key = a.subtype || '__none__';
    bySub[key] = bySub[key] || {
      id: key,
      name: findSubtype(groupId, a.subtype)?.name || 'Khác',
      value: 0,
      count: 0,
    };
    bySub[key].value += Math.abs(a.value || 0);
    bySub[key].count += 1;
  }

  const items = Object.values(bySub).sort((a, b) => b.value - a.value);
  const slices = items.map((s, i) => ({
    key: s.id,
    name: s.name,
    value: s.value,
    color: PALETTE[i % PALETTE.length],
    count: s.count,
  }));

  return `
    <div class="drill-header">
      <h2>${escapeHtml(g?.icon || '📦')} ${escapeHtml(g?.name || groupId)} — theo loại</h2>
      <button class="secondary small" data-back="group">← Quay lại</button>
    </div>
    ${renderPie(slices, null, 'Nhóm này chưa có tài sản')}
  `;
}

function renderMemberChart(byMember) {
  const slices = byMember.map((m) => ({
    key: m.id,
    name: m.name,
    value: Math.abs(m.value),
    color: m.color || PALETTE[0],
    count: m.count,
  }));
  return `
    <h2>Phân bổ theo thành viên</h2>
    ${renderPie(slices, 'member', 'Chưa có dữ liệu')}
  `;
}

function renderMemberDrilldown(assets, members, memberId) {
  const m = (members || []).find((x) => String(x.id) === String(memberId));
  const own = (assets || []).filter((a) => String(a.member_id) === String(memberId));

  const byGroup = {};
  for (const a of own) {
    const g = findGroup(a.group_id);
    byGroup[a.group_id] = byGroup[a.group_id] || {
      id: a.group_id,
      name: `${g?.icon || '📦'} ${g?.name || a.group_id}`,
      value: 0,
      count: 0,
    };
    byGroup[a.group_id].value += Math.abs(a.value || 0);
    byGroup[a.group_id].count += 1;
  }

  const items = Object.values(byGroup).sort((a, b) => b.value - a.value);
  const slices = items.map((s) => ({
    key: s.id,
    name: s.name,
    value: s.value,
    color: GROUP_COLORS[s.id] || PALETTE[0],
    count: s.count,
  }));

  return `
    <div class="drill-header">
      <h2><span class="member-chip" style="background:${escapeHtml(m?.color || '#3b82f6')}">${escapeHtml(m?.name || '—')}</span> — theo nhóm</h2>
      <button class="secondary small" data-back="member">← Quay lại</button>
    </div>
    ${renderPie(slices, null, 'Thành viên này chưa có tài sản')}
  `;
}

// ─── Pie chart primitive ────────────────────────────────────────────────────

function renderPie(slices, clickGroup, emptyText) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (slices.length === 0 || total === 0) {
    return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  }

  const size = 240, cx = size / 2, cy = size / 2, r = size / 2 - 4;
  let cumulative = 0;
  const paths = slices.map((s) => {
    const startAngle = (cumulative / total) * Math.PI * 2;
    cumulative += s.value;
    const endAngle = (cumulative / total) * Math.PI * 2;
    const pct = (s.value / total) * 100;

    let shape;
    if (slices.length === 1) {
      shape = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.color}" />`;
    } else {
      const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
      const x1 = cx + r * Math.sin(startAngle);
      const y1 = cy - r * Math.cos(startAngle);
      const x2 = cx + r * Math.sin(endAngle);
      const y2 = cy - r * Math.cos(endAngle);
      shape = `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${s.color}" />`;
    }

    // Percentage label inside slice (only if big enough)
    let label = '';
    if (pct >= 6) {
      const midAngle = (startAngle + endAngle) / 2;
      const labelR = r * 0.65;
      const lx = cx + labelR * Math.sin(midAngle);
      const ly = cy - labelR * Math.cos(midAngle);
      label = `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" class="pie-slice-label" text-anchor="middle" dominant-baseline="central">${pct.toFixed(1)}%</text>`;
    }
    return `<g><title>${escapeHtml(s.name)}: ${fmtVND(s.value)} (${pct.toFixed(1)}%)</title>${shape}${label}</g>`;
  }).join('');

  const legend = slices.map((s) => {
    const pct = (s.value / total) * 100;
    const clickable = clickGroup ? `data-pie-click="${clickGroup}" data-key="${escapeHtml(s.key)}"` : '';
    const cls = clickGroup ? 'pie-legend-row clickable' : 'pie-legend-row';
    return `
      <div class="${cls}" ${clickable}>
        <span class="legend-dot" style="background:${s.color}"></span>
        <span class="legend-name">${escapeHtml(s.name)}${s.count != null ? ` <span class="badge">${s.count}</span>` : ''}</span>
        <span class="legend-value">${fmtVND(s.value)}</span>
        <span class="legend-pct">${pct.toFixed(1)}%</span>
      </div>
    `;
  }).join('');

  return `
    <div class="pie-wrap">
      <svg class="pie-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-label="Pie chart">${paths}</svg>
      <div class="pie-legend">${legend}</div>
    </div>
  `;
}

// ─── Aggregation ────────────────────────────────────────────────────────────

// Computes KPIs + byGroup/byMember breakdowns from raw enriched-by-backend
// asset rows. Group metadata (name/icon/type) comes from hard-coded list.
function aggregate(assets, members) {
  const memberById = Object.fromEntries((members || []).map((m) => [m.id, m]));

  let totalAsset = 0;
  let totalLiability = 0;
  let totalCost = 0;
  const byGroup = {};
  const byMember = {};

  for (const a of assets || []) {
    const g = findGroup(a.group_id);
    const isLiability = g?.type === 'Liability';
    const value = a.value || 0;
    const cost = a.cost || 0;
    if (isLiability) totalLiability += value;
    else totalAsset += value;
    totalCost += cost;

    const gk = a.group_id;
    byGroup[gk] = byGroup[gk] || {
      id: gk,
      name: g?.name || gk,
      icon: g?.icon || '📦',
      type: g?.type || 'Asset',
      value: 0, cost: 0, count: 0,
    };
    byGroup[gk].value += value;
    byGroup[gk].cost += cost;
    byGroup[gk].count += 1;

    if (a.member_id) {
      const m = memberById[a.member_id];
      const mk = a.member_id;
      byMember[mk] = byMember[mk] || {
        id: mk,
        name: m?.name || '—',
        color: m?.color || '#3b82f6',
        value: 0, count: 0,
      };
      byMember[mk].value += isLiability ? -value : value;
      byMember[mk].count += 1;
    }
  }

  const netWorth = totalAsset - totalLiability;
  const pnl = totalAsset - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

  return {
    kpi: { netWorth, totalAsset, totalLiability, totalCost, pnl, pnlPct },
    byGroup: Object.values(byGroup).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
    byMember: Object.values(byMember).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
  };
}
