import { api } from '../api.js';
import { fmtVND, escapeHtml, toast } from '../main.js';
import { findGroup, findSubtype, ASSET_GROUPS } from '../data/groups.js';
import { GROUP_COLORS } from './dashboard.js';

// Stack order (bottom-up) for the asset area. Liability is rendered as a
// single line overlay on top — never stacked, never negative.
const POS_ORDER = ['bank', 'tien-gui', 'cho-vay', 'tich-tru', 'dau-tu'];
const LIAB_GROUP = 'di-vay';

const RANGES = {
  '3m':  { days: 90,  label: '3 tháng'  },
  '6m':  { days: 182, label: '6 tháng'  },
  '1y':  { days: 365, label: '1 năm'    },
  'all': { days: null, label: 'Tất cả'  },
};

// Module state survives across re-paints so toggling a filter doesn't reset
// the others. Wiped on full reload.
let _state = { range: 'all', period: 'weekly', summary: 'group' };
let _data = null;
let _viewEl = null;

export async function renderSnapshots(view) {
  _viewEl = view;
  _data = await api.get('/snapshots?from=1970-01-01');
  paint();
  bindResize();
}

let _resizeBound = false;
let _resizeTimer = null;
function bindResize() {
  if (_resizeBound) return;
  _resizeBound = true;
  window.addEventListener('resize', () => {
    // Only re-paint while the snapshots page is mounted.
    if (!_viewEl?.isConnected || !_viewEl.querySelector('.snap-chart')) return;
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(paint, 120);
  });
}

function paint() {
  const filtered  = filterByRange(_data, _state.range);
  const periodic  = _state.period === 'monthly' ? aggregateMonthly(filtered) : filtered;
  const series    = buildSeries(periodic, _state.summary);
  const dates     = [...new Set(periodic.map((r) => r.snapshot_date))].sort();
  const byDateKey = indexByDateKey(periodic, _state.summary);
  const liabByDate = liabilityByDate(periodic);

  // Size the SVG viewBox to the container's actual width so the chart renders
  // 1:1 and text labels don't stretch. 42 ≈ section padding (20+20) + border.
  const chartW = Math.max(560, Math.floor((_viewEl.clientWidth || 720) - 42));
  _viewEl.innerHTML = renderShell(dates, byDateKey, liabByDate, series, chartW);
  wire();
}

function wire() {
  _viewEl.querySelector('[data-action="snapshot-now"]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('btn-loading');
    try {
      await api.post('/snapshots/run', {});
      toast('Đã tạo snapshot');
      _data = await api.get('/snapshots?from=1970-01-01');
      paint();
    } catch (err) {
      btn.classList.remove('btn-loading');
      toast(`Lỗi: ${err.message}`);
    }
  });

  _viewEl.querySelectorAll('[data-set]').forEach((el) => {
    el.addEventListener('click', () => {
      _state[el.dataset.set] = el.dataset.val;
      paint();
    });
  });
}

// ─── Shell + KPI ────────────────────────────────────────────────────────────

function renderShell(dates, byDateKey, liabByDate, series, chartW) {
  const header = `
    <div class="page-header">
      <h1>📈 Tăng trưởng</h1>
      <button class="btn" data-action="snapshot-now">📸 Tạo snapshot ngay</button>
    </div>
  `;

  if (dates.length === 0) {
    return `${header}
      <div class="section">
        ${renderControls()}
        <div class="empty">Không có dữ liệu trong khoảng đã chọn.</div>
      </div>`;
  }

  const last  = byDateKey.get(dates[dates.length - 1]) || new Map();
  const first = byDateKey.get(dates[0]) || new Map();
  const sumAreas = (m) => series.reduce((s, ser) => s + (m.get(ser.key) || 0), 0);
  const lastAssets = sumAreas(last);
  const lastLiab   = liabByDate.get(dates[dates.length - 1]) || 0;
  const firstNet   = sumAreas(first) - (liabByDate.get(dates[0]) || 0);
  const lastNet    = lastAssets - lastLiab;
  const netDelta   = lastNet - firstNet;
  const netPct     = firstNet > 0 ? (netDelta / firstNet) * 100 : 0;

  return `${header}
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="label">Tổng tài sản (mới nhất)</div>
        <div class="value">${fmtVND(lastAssets)}</div>
        <div class="sub">${escapeHtml(dates[dates.length - 1])}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Nợ phải trả</div>
        <div class="value">${fmtVND(lastLiab)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Tài sản ròng</div>
        <div class="value ${lastNet >= 0 ? 'pos' : 'neg'}">${fmtVND(lastNet)}</div>
        <div class="sub ${netDelta >= 0 ? 'pos' : 'neg'}">${netDelta >= 0 ? '+' : ''}${fmtVND(netDelta)} (${netPct.toFixed(1)}%) từ ${escapeHtml(dates[0])}</div>
      </div>
    </div>
    <div class="section">
      ${renderControls()}
      ${renderChart(dates, byDateKey, liabByDate, series, chartW)}
    </div>
  `;
}

function renderControls() {
  const pill = (set, val, label) =>
    `<button class="snap-pill${_state[set] === val ? ' active' : ''}" data-set="${set}" data-val="${val}">${escapeHtml(label)}</button>`;

  return `
    <div class="snap-controls">
      <div class="snap-control-group">
        <span class="snap-control-label">Khoảng:</span>
        ${pill('range', '3m',  '3T')}
        ${pill('range', '6m',  '6T')}
        ${pill('range', '1y',  '1N')}
        ${pill('range', 'all', 'Tất cả')}
      </div>
      <div class="snap-control-group">
        <span class="snap-control-label">Kỳ:</span>
        ${pill('period', 'weekly',  'Tuần')}
        ${pill('period', 'monthly', 'Tháng')}
      </div>
      <div class="snap-control-group">
        <span class="snap-control-label">Phân loại:</span>
        ${pill('summary', 'group',   'Nhóm')}
        ${pill('summary', 'subtype', 'Loại con')}
      </div>
    </div>
  `;
}

// ─── Filtering + aggregation ────────────────────────────────────────────────

function filterByRange(rows, range) {
  const days = RANGES[range]?.days;
  if (!days) return rows;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return rows.filter((r) => r.snapshot_date >= cutoff);
}

// Monthly = pick the latest snapshot in each YYYY-MM per (group_id, subtype).
function aggregateMonthly(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const ym = r.snapshot_date.slice(0, 7);
    const key = `${ym}|${r.group_id}|${r.subtype || ''}`;
    const prev = byKey.get(key);
    if (!prev || r.snapshot_date > prev.snapshot_date) {
      byKey.set(key, { ...r, snapshot_date: ym });
    }
  }
  return [...byKey.values()];
}

// ─── Series + indexing ──────────────────────────────────────────────────────

function bucketKey(r, mode) {
  return mode === 'subtype' ? `${r.group_id}/${r.subtype || ''}` : r.group_id;
}

// Index asset (non-liability) rows by date → key → value, where `key` is
// either group_id or `${group_id}/${subtype}` depending on summary mode.
// Liability rows are excluded; they're aggregated separately into a single
// line via liabilityByDate.
function indexByDateKey(rows, mode) {
  const out = new Map();
  for (const r of rows) {
    if (r.group_id === LIAB_GROUP) continue;
    let m = out.get(r.snapshot_date);
    if (!m) { m = new Map(); out.set(r.snapshot_date, m); }
    const k = bucketKey(r, mode);
    m.set(k, (m.get(k) || 0) + (r.value || 0));
  }
  return out;
}

// Sum of all liability subtypes per snapshot_date — drives the single
// overlay line, regardless of summary mode.
function liabilityByDate(rows) {
  const out = new Map();
  for (const r of rows) {
    if (r.group_id !== LIAB_GROUP) continue;
    out.set(r.snapshot_date, (out.get(r.snapshot_date) || 0) + (r.value || 0));
  }
  return out;
}

// Build the ordered list of stacked-area series. Liability is NOT in this
// list — it's drawn as a single line overlay (see renderChart).
function buildSeries(rows, mode) {
  if (mode === 'group') {
    return POS_ORDER.map((g) => seriesForGroup(g));
  }

  // mode === 'subtype' — enumerate (group, subtype) pairs that actually
  // appear in `rows`, ordered by group (POS_ORDER) and within each group
  // by the canonical subtype order from groups.js (null last).
  const present = new Set(rows.filter((r) => r.group_id !== LIAB_GROUP).map((r) => `${r.group_id}/${r.subtype || ''}`));
  const out = [];
  for (const g of POS_ORDER) {
    const meta = findGroup(g);
    if (!meta) continue;
    const orderedSubIds = [...meta.subtypes.map((s) => s.id), ''];
    const keys = orderedSubIds.map((s) => `${g}/${s}`).filter((k) => present.has(k));
    keys.forEach((k, i) => {
      out.push(seriesForSubtype(g, k.split('/')[1], i, keys.length));
    });
  }
  return out;
}

function seriesForGroup(g) {
  const m = findGroup(g);
  return {
    key: g,
    label: m?.name || g,
    icon: m?.icon || '',
    color: GROUP_COLORS[g] || '#94a3b8',
    opacity: 0.85,
  };
}

function seriesForSubtype(g, subtypeId, idx, total) {
  const gMeta = findGroup(g);
  const sMeta = subtypeId ? findSubtype(g, subtypeId) : null;
  // First subtype = darkest, last subtype = lightest. Range chosen so even
  // the lightest stays distinguishable against the page background.
  const opacity = total <= 1 ? 0.85 : 0.45 + (1 - idx / (total - 1)) * 0.5;
  return {
    key: `${g}/${subtypeId}`,
    label: sMeta ? `${gMeta?.name} — ${sMeta.name}` : (gMeta?.name || g),
    icon: gMeta?.icon || '',
    color: GROUP_COLORS[g] || '#94a3b8',
    opacity,
  };
}

// ─── Stacked area chart + liability line ────────────────────────────────────

function renderChart(dates, byDateKey, liabByDate, series, W) {
  const H = 320;
  const PAD_L = 70, PAD_R = 16, PAD_T = 16, PAD_B = 36;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // Per-date stacked positions for the asset area + liability value.
  const points = dates.map((d) => {
    const m = byDateKey.get(d) || new Map();
    let posSum = 0;
    const pos = {};
    for (const s of series) {
      const v = m.get(s.key) || 0;
      pos[s.key] = { from: posSum, to: posSum + v };
      posSum += v;
    }
    return { date: d, pos, posSum, liab: liabByDate.get(d) || 0 };
  });

  // Y axis must fit the tallest asset stack AND the highest liability point.
  const maxY = Math.max(
    ...points.map((p) => p.posSum),
    ...points.map((p) => p.liab),
    1,
  );
  const yScale = innerH / maxY;
  // A single snapshot has no horizontal extent, so draw a full-width flat band
  // instead of a degenerate vertical line at the centre.
  const single = dates.length === 1;
  const xAt = (i) => PAD_L + (single ? innerW / 2 : (i / (dates.length - 1)) * innerW);
  const yAt = (v) => PAD_T + innerH - v * yScale;

  // Asset area paths
  const areas = series.map((s) => {
    if (single) {
      const yTo = yAt(points[0].pos[s.key].to), yFrom = yAt(points[0].pos[s.key].from);
      return `<rect x="${PAD_L.toFixed(2)}" y="${yTo.toFixed(2)}" width="${innerW.toFixed(2)}" height="${(yFrom - yTo).toFixed(2)}" fill="${s.color}" fill-opacity="${s.opacity.toFixed(2)}" />`;
    }
    const top = points.map((p, i) => `${xAt(i).toFixed(2)},${yAt(p.pos[s.key].to).toFixed(2)}`);
    const bot = points.map((p, i) => `${xAt(i).toFixed(2)},${yAt(p.pos[s.key].from).toFixed(2)}`).reverse();
    return `<path d="M ${top.join(' L ')} L ${bot.join(' L ')} Z" fill="${s.color}" fill-opacity="${s.opacity.toFixed(2)}" />`;
  }).join('');

  // Liability line overlay (single polyline + dots at each data point).
  const liabColor = GROUP_COLORS[LIAB_GROUP] || '#ef4444';
  const liabMeta = findGroup(LIAB_GROUP);
  const linePoints = single
    ? `${PAD_L.toFixed(2)},${yAt(points[0].liab).toFixed(2)} ${(W - PAD_R).toFixed(2)},${yAt(points[0].liab).toFixed(2)}`
    : points.map((p, i) => `${xAt(i).toFixed(2)},${yAt(p.liab).toFixed(2)}`).join(' ');
  const liabLine = `
    <polyline class="snap-liab-line" points="${linePoints}" fill="none" stroke="${liabColor}" stroke-width="2.5" stroke-dasharray="6 4" stroke-linejoin="round" stroke-linecap="round" />
    ${points.map((p, i) => `<circle cx="${xAt(i).toFixed(2)}" cy="${yAt(p.liab).toFixed(2)}" r="3" fill="${liabColor}" />`).join('')}
  `;

  // Gridlines + Y labels
  const ySteps = niceSteps(maxY, 4);
  const gridLines = ySteps.map((v) => {
    const y = yAt(v).toFixed(2);
    return `
      <line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="var(--border)" stroke-dasharray="2 3" />
      <text x="${PAD_L - 6}" y="${y}" class="snap-axis-y" text-anchor="end" dominant-baseline="middle">${fmtAxis(v)}</text>
    `;
  }).join('');
  const baseLine = `<line x1="${PAD_L}" y1="${yAt(0).toFixed(2)}" x2="${W - PAD_R}" y2="${yAt(0).toFixed(2)}" stroke="var(--muted)" />`;

  // X labels
  const labelEvery = Math.max(1, Math.ceil(dates.length / 8));
  const xLabels = dates.map((d, i) => {
    if (i % labelEvery !== 0 && i !== dates.length - 1) return '';
    return `<text x="${xAt(i).toFixed(2)}" y="${(H - PAD_B + 16).toFixed(2)}" class="snap-axis-x" text-anchor="middle">${shortDate(d, _state.period)}</text>`;
  }).join('');

  // Per-date hover tooltip — invisible column rectangle reveals a tooltip on hover.
  const TT_W = 280, TT_LH = 17, TT_PAD = 10;
  const tooltips = points.map((p, i) => {
    const x = xAt(i);
    const colW = innerW / Math.max(dates.length, 1);
    const colX = x - colW / 2;
    const net = p.posSum - p.liab;

    const areaLines = series.map((s) => {
      const amount = p.pos[s.key].to - p.pos[s.key].from;
      if (!amount) return '';
      return `<tspan x="0" dy="${TT_LH}">${escapeHtml(s.icon)} ${escapeHtml(s.label)}: ${fmtVND(amount)}</tspan>`;
    }).filter(Boolean).join('');
    const liabLineText = p.liab
      ? `<tspan x="0" dy="${TT_LH}">${escapeHtml(liabMeta?.icon || '')} ${escapeHtml(liabMeta?.name || 'Đi vay')}: −${fmtVND(p.liab)}</tspan>`
      : '';

    const lineCount = (areaLines + liabLineText).match(/<tspan/g)?.length || 0;
    const tooltipH = (lineCount + 2) * TT_LH + TT_PAD;
    // Flip the tooltip to the left whenever drawing it on the right would
    // overflow the chart's right edge (e.g. the last point in a 1–2 item set).
    const flipLeft = x + 8 + TT_W > W - PAD_R;

    return `
      <g class="snap-hover">
        <rect x="${colX.toFixed(2)}" y="${PAD_T}" width="${colW.toFixed(2)}" height="${innerH.toFixed(2)}" fill="transparent" />
        <g class="snap-tooltip" transform="translate(${x.toFixed(2)}, ${PAD_T + 8})">
          <line x1="0" y1="0" x2="0" y2="${innerH.toFixed(2)}" stroke="var(--text)" stroke-opacity="0.4" stroke-dasharray="3 3" />
          <g transform="translate(${flipLeft ? -(TT_W + 8) : 8}, 0)">
            <rect class="snap-tooltip-bg" x="-6" y="-6" width="${TT_W}" height="${tooltipH}" rx="6" />
            <text class="snap-tooltip-text">
              <tspan x="0" dy="12" font-weight="700">${escapeHtml(p.date)}</tspan>
              ${areaLines}
              ${liabLineText}
              <tspan x="0" dy="${TT_LH}" font-weight="700">Ròng: ${fmtVND(net)}</tspan>
            </text>
          </g>
        </g>
      </g>
    `;
  }).join('');

  const areaLegend = series.map((s) =>
    `<span class="snap-legend-item">
       <span class="legend-dot" style="background:${s.color};opacity:${s.opacity.toFixed(2)}"></span>
       <span>${escapeHtml(s.icon)} ${escapeHtml(s.label)}</span>
     </span>`
  ).join('');
  const liabLegend = `
    <span class="snap-legend-item">
      <svg class="snap-legend-line" width="22" height="10" aria-hidden="true">
        <line x1="0" y1="5" x2="22" y2="5" stroke="${liabColor}" stroke-width="2.5" stroke-dasharray="6 4" />
      </svg>
      <span>${escapeHtml(liabMeta?.icon || '')} ${escapeHtml(liabMeta?.name || 'Đi vay')}</span>
    </span>`;

  return `
    <div class="snap-chart">
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="snap-svg" aria-label="Stacked growth chart">
        ${gridLines}
        ${areas}
        ${liabLine}
        ${baseLine}
        ${xLabels}
        ${tooltips}
      </svg>
      <div class="snap-legend">${areaLegend}${liabLegend}</div>
    </div>
  `;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function niceSteps(max, n) {
  if (max <= 0) return [];
  const raw = max / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  const step = nice * mag;
  const steps = [];
  for (let v = step; v <= max + 1; v += step) steps.push(v);
  return steps;
}

function fmtAxis(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(v >= 1e10 ? 0 : 1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'k';
  return String(v);
}

function shortDate(iso, period) {
  if (period === 'monthly') {
    // 'YYYY-MM' → 'MM/YY'
    const [y, m] = iso.split('-');
    return `${m}/${y.slice(2)}`;
  }
  // 'YYYY-MM-DD' → 'DD/MM'
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
