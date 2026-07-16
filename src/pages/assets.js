import { api } from '../api.js';
import { fmtVND, fmtPct, escapeHtml, openModal, closeModal, toast, rerender, bindMoneyInputs, parseMoneyPayload } from '../main.js';
import { bankSelectHTML, bindBankSelect } from '../components/bank-select.js';
import { platformSelectHTML } from '../components/platform-select.js';
import { formatBank } from '../data/banks.js';
import { ASSET_GROUPS, findGroup, enrichAsset, isLiquid, nextInterestPaymentDate } from '../data/groups.js';
import { shareAsset, shareGroup, SHARE_ICON } from '../share.js';

const MONEY_FIELDS = ['cost_price', 'current_price'];
const BANK_SAVINGS_SUBTYPE = 'so-tiet-kiem';
const PAGE_SIZE = 20;

// "Sắp đáo hạn: N ngày" chip threshold. Synced from user-setting
// `notify.maturity_days_ahead` (default 3) on page load.
let maturityWarnDays = 3;

export async function renderAssets(view) {
  const hashQuery = window.location.hash.split('?')[1] || '';
  const urlParams = new URLSearchParams(hashQuery);
  const initQ         = urlParams.get('q')         || '';
  const initGroup     = urlParams.get('group')      || '';
  const initMember    = urlParams.get('member')     || '';
  const initAvailable = urlParams.get('available')  || '';
  const initSubtype   = urlParams.get('subtype')    || '';
  const initSort      = urlParams.get('sort')       || 'id-desc';
  const initView      = urlParams.get('view')       || 'grouped';

  const applyAvailableFilter = (list, av) => {
    if (av === '1') return list.filter((a) => isLiquid(a));
    if (av === '0') return list.filter((a) => !isLiquid(a));
    return list;
  };

  const fetchAssets = async (q, group, member) => {
    const p = new URLSearchParams();
    if (q)      p.set('q', q);
    if (group)  p.set('group', group);
    if (member) p.set('member', member);
    return (await api.get('/assets?' + p.toString())).map(enrichAsset);
  };

  const [rawAll, members, userSettings] = await Promise.all([
    fetchAssets(initQ, initGroup, initMember),
    api.get('/members'),
    api.get('/user-settings'),
  ]);
  maturityWarnDays = Number(userSettings['notify.maturity_days_ahead']) || 3;

  const allAssets = initSubtype ? rawAll.filter((a) => a.subtype === initSubtype) : rawAll;
  const assets = applyAvailableFilter(allAssets, initAvailable);

  view.innerHTML = `
    <div class="page-header">
      <h1>💼 Tài sản</h1>
      <button id="btn-new">+ Thêm tài sản</button>
    </div>

    <div class="section">
      <div class="toolbar">
        <input id="f-q" placeholder="Tìm kiếm theo tên..." value="${escapeHtml(initQ)}" style="flex:1; min-width:140px;" />
        <div class="filter-with-icon">
          <span class="filter-icon" aria-hidden="true">🗂️</span>
          <select id="f-group">
            <option value="">Tất cả nhóm</option>
            ${ASSET_GROUPS.map((g) => `<option value="${escapeHtml(g.id)}" ${g.id === initGroup ? 'selected' : ''}>${escapeHtml(g.icon)} ${escapeHtml(g.name)}</option>`).join('')}
          </select>
        </div>
        <div class="filter-with-icon">
          <span class="filter-icon" aria-hidden="true">👤</span>
          <select id="f-member">
            <option value="">Tất cả thành viên</option>
            ${members.map((m) => `<option value="${m.id}" ${String(m.id) === initMember ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
          </select>
        </div>
        <div class="filter-with-icon">
          <span class="filter-icon" aria-hidden="true">💵</span>
          <select id="f-available">
            <option value=""  ${initAvailable === ''  ? 'selected' : ''}>Tất cả</option>
            <option value="1" ${initAvailable === '1' ? 'selected' : ''}>Khả dụng</option>
            <option value="0" ${initAvailable === '0' ? 'selected' : ''}>Chưa khả dụng</option>
          </select>
        </div>
        <div class="filter-with-icon">
          <span class="filter-icon" aria-hidden="true">↕️</span>
          <select id="f-sort">
            <option value="id-desc"      ${initSort === 'id-desc'      ? 'selected' : ''}>Mặc định</option>
            <option value="maturity-asc" ${initSort === 'maturity-asc' ? 'selected' : ''}>Đáo hạn sớm nhất</option>
            <option value="next-pay-asc" ${initSort === 'next-pay-asc' ? 'selected' : ''}>Trả lãi gần nhất</option>
            <option value="value-desc"   ${initSort === 'value-desc'   ? 'selected' : ''}>Giá trị cao nhất</option>
            <option value="pnl-desc"     ${initSort === 'pnl-desc'     ? 'selected' : ''}>Lãi cao nhất</option>
            <option value="name-asc"     ${initSort === 'name-asc'     ? 'selected' : ''}>Tên A→Z</option>
          </select>
        </div>
        <div class="segmented">
          <button id="f-view-grouped"  class="small secondary ${initView === 'grouped'  ? 'active' : ''}">Nhóm</button>
          <button id="f-view-flat"     class="small secondary ${initView === 'flat'     ? 'active' : ''}">Danh sách</button>
          <button id="f-view-timeline" class="small secondary ${initView === 'timeline' ? 'active' : ''}">Timeline</button>
        </div>
      </div>

      <div id="asset-list"></div>
    </div>
  `;

  let filterTimer;
  let cachedAll = allAssets;
  let currentAssets = assets;
  let currentPage = 0;

  const getViewMode = () => {
    if (document.getElementById('f-view-grouped').classList.contains('active'))  return 'grouped';
    if (document.getElementById('f-view-timeline').classList.contains('active')) return 'timeline';
    return 'flat';
  };
  const getSort = () => document.getElementById('f-sort').value;

  const syncURL = () => {
    const q         = document.getElementById('f-q').value;
    const group     = document.getElementById('f-group').value;
    const member    = document.getElementById('f-member').value;
    const available = document.getElementById('f-available').value;
    const sort      = getSort();
    const vw        = getViewMode();
    const p = new URLSearchParams();
    if (q)                 p.set('q', q);
    if (group)             p.set('group', group);
    if (member)            p.set('member', member);
    if (available)         p.set('available', available);
    if (sort !== 'id-desc')     p.set('sort', sort);
    if (vw !== 'grouped')  p.set('view', vw);
    const qs = p.toString();
    history.replaceState(null, '', qs ? `#/assets?${qs}` : '#/assets');
  };

  const redisplay = () => {
    const vw = getViewMode();
    // Timeline is inherently chronological and builds from all filtered assets,
    // ignoring the sort dropdown (date-based sorts would drop assets whose
    // interest events should still appear).
    const sorted = vw === 'timeline' ? currentAssets : sortAssets(currentAssets, getSort());
    document.getElementById('asset-list').innerHTML =
      renderSummaryBar(sorted) +
      (vw === 'grouped'  ? renderGroupedView(sorted)
       : vw === 'timeline' ? renderTimelineView(sorted)
       : renderFlatView(sorted, currentPage));
    bindRowActions(currentAssets, members, reload);
    document.querySelectorAll('#asset-list [data-page]').forEach((btn) => {
      btn.onclick = () => { currentPage = Number(btn.dataset.page); redisplay(); };
    });
  };

  const reload = async () => {
    const q         = document.getElementById('f-q').value;
    const group     = document.getElementById('f-group').value;
    const member    = document.getElementById('f-member').value;
    const available = document.getElementById('f-available').value;
    syncURL();
    const fetched = await fetchAssets(q, group, member);
    cachedAll = fetched;
    currentAssets = applyAvailableFilter(fetched, available);
    currentPage = 0;
    redisplay();
  };

  redisplay();

  document.getElementById('btn-new').onclick = () => openAssetModal(null, members, reload);

  if (urlParams.get('new') === '1') {
    history.replaceState(null, '', '#/assets');
    openAssetModal(null, members, reload);
  }

  document.getElementById('f-q').oninput = () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(reload, 200);
  };
  document.getElementById('f-group').onchange = reload;
  document.getElementById('f-member').onchange = reload;
  document.getElementById('f-available').onchange = () => {
    syncURL();
    currentAssets = applyAvailableFilter(cachedAll, document.getElementById('f-available').value);
    currentPage = 0;
    redisplay();
  };
  document.getElementById('f-sort').onchange = () => { syncURL(); redisplay(); };

  const setView = (vw) => {
    document.getElementById('f-view-grouped').classList.toggle('active', vw === 'grouped');
    document.getElementById('f-view-flat').classList.toggle('active', vw === 'flat');
    document.getElementById('f-view-timeline').classList.toggle('active', vw === 'timeline');
    currentPage = 0;
    syncURL();
    redisplay();
  };
  document.getElementById('f-view-grouped').onclick  = () => setView('grouped');
  document.getElementById('f-view-flat').onclick     = () => setView('flat');
  document.getElementById('f-view-timeline').onclick = () => setView('timeline');
}

// ── Sort ──────────────────────────────────────────────────────────────────────

function sortAssets(assets, sortBy) {
  const copy = [...assets];
  const matKey = (a) => a.maturity_date || '9999-99-99';
  const nextPayKey = (a) => nextInterestPaymentDate(a) || '9999-99-99';
  // Date-based sorts only show assets that actually have the relevant date.
  if (sortBy === 'maturity-asc') {
    return copy.filter((a) => a.maturity_date)
               .sort((a, b) => matKey(a).localeCompare(matKey(b)));
  }
  if (sortBy === 'next-pay-asc') {
    return copy.filter((a) => nextInterestPaymentDate(a))
               .sort((a, b) => nextPayKey(a).localeCompare(nextPayKey(b)));
  }
  if (sortBy === 'value-desc')   return copy.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  if (sortBy === 'pnl-desc')     return copy.sort((a, b) => (b.pnl ?? -Infinity) - (a.pnl ?? -Infinity));
  if (sortBy === 'name-asc')     return copy.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  return copy;
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function renderSummaryBar(assets) {
  if (!assets.length) return '';
  const assetItems     = assets.filter((a) => a.group_type !== 'Liability');
  const liabilityItems = assets.filter((a) => a.group_type === 'Liability');
  const totalAsset     = assetItems.reduce((s, a) => s + (a.value ?? 0), 0);
  const totalLiability = liabilityItems.reduce((s, a) => s + (a.value ?? 0), 0);
  const totalPnl       = assets.reduce((s, a) => s + (a.pnl ?? 0), 0);
  const pnlClass       = totalPnl >= 0 ? 'pos' : 'neg';
  const netValue       = totalAsset - totalLiability;

  return `
    <div class="summary-bar">
      <div class="summary-item">
        <span class="summary-label">Tổng tài sản</span>
        <span class="summary-value">${fmtVND(totalAsset)}</span>
      </div>
      ${totalLiability ? `
      <div class="summary-item">
        <span class="summary-label">Tài sản ròng</span>
        <span class="summary-value">${fmtVND(netValue)}</span>
      </div>` : ''}
      <div class="summary-item">
        <span class="summary-label">Lãi / Lỗ</span>
        <span class="summary-value ${pnlClass}">${fmtVND(totalPnl)}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">Số tài sản</span>
        <span class="summary-value">${assets.length}</span>
      </div>
    </div>
  `;
}

// ── Grouped view ──────────────────────────────────────────────────────────────

function renderGroupedView(assets) {
  if (!assets.length) return '<div class="empty">Chưa có tài sản nào</div>';

  const byGroup = new Map();
  for (const a of assets) {
    if (!byGroup.has(a.group_id)) byGroup.set(a.group_id, []);
    byGroup.get(a.group_id).push(a);
  }

  return ASSET_GROUPS
    .filter((g) => byGroup.has(g.id))
    .map((g) => {
      const items        = byGroup.get(g.id);
      const subtotal     = items.reduce((s, a) => s + (a.value ?? 0), 0);
      const subtotalPnl  = items.reduce((s, a) => s + (a.pnl ?? 0), 0);
      const pnlClass     = subtotalPnl >= 0 ? 'pos' : 'neg';
      const pnlSign      = subtotalPnl >= 0 ? '+' : '';
      return `
        <div class="asset-group-section" data-group-id="${escapeHtml(g.id)}">
          <div class="asset-group-header">
            <span class="group-header-title"><span class="group-chevron">▾</span> ${escapeHtml(g.icon)} ${escapeHtml(g.name)} <span class="muted-sm">(${items.length})</span></span>
            <span class="group-header-totals">
              <span class="group-total-value">${fmtVND(subtotal)}</span>
              <span class="group-total-pnl ${pnlClass}">${pnlSign}${fmtVND(subtotalPnl)}</span>
              <button class="small secondary icon-btn" data-act="share-group" title="Chia sẻ ảnh" aria-label="Chia sẻ nhóm">${SHARE_ICON}</button>
            </span>
          </div>
          <div class="asset-list">
            ${renderListHeader(false)}
            ${items.map((a) => renderAssetRow(a, false)).join('')}
          </div>
        </div>
      `;
    })
    .join('');
}

// ── Flat view with pagination ─────────────────────────────────────────────────

function renderFlatView(assets, page) {
  if (!assets.length) return '<div class="empty">Chưa có tài sản nào</div>';

  const pageItems = assets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return `
    <div class="asset-list">
      ${renderListHeader(true)}
      ${pageItems.map((a) => renderAssetRow(a, true)).join('')}
    </div>
    ${assets.length > PAGE_SIZE ? renderPagination(assets.length, page) : ''}
  `;
}

// ── Timeline view ─────────────────────────────────────────────────────────────

const WEEKDAYS_VI = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

const TIMELINE_KINDS = {
  maturity: { icon: '⏰', label: 'Đáo hạn' },
  receive:  { icon: '💰', label: 'Nhận lãi' },
  pay:      { icon: '💸', label: 'Trả lãi' },
};

function timelineDateLabel(dateStr) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / 86400000);
  const rel = diffDays === 0 ? 'Hôm nay'
    : diffDays > 0 ? `Còn ${diffDays} ngày`
    : `Quá hạn ${Math.abs(diffDays)} ngày`;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return {
    text: `${WEEKDAYS_VI[d.getDay()]}, ${dd}/${mm}/${d.getFullYear()}`,
    rel,
    overdue: diffDays < 0,
    isToday: diffDays === 0,
    upcoming: diffDays > 0 && diffDays <= maturityWarnDays,
  };
}

function renderTimelineView(assets) {
  const events = [];
  for (const a of assets) {
    if (a.maturity_date) events.push({ date: a.maturity_date, kind: 'maturity', a });
    const pay = nextInterestPaymentDate(a);
    if (pay) events.push({ date: pay, kind: a.group_id === 'di-vay' ? 'pay' : 'receive', a });
  }
  if (!events.length) return '<div class="empty">Không có sự kiện tài chính nào</div>';

  events.sort((x, y) => x.date.localeCompare(y.date));
  const byDate = new Map();
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }

  return `
    <div class="timeline">
      ${[...byDate.entries()].map(([date, evts]) => {
        const { text, rel, overdue, isToday, upcoming } = timelineDateLabel(date);
        return `
          <div class="tl-day${overdue ? ' overdue' : ''}${isToday ? ' today' : ''}${upcoming ? ' upcoming' : ''}">
            <div class="tl-date">
              <span class="tl-dot"></span>
              <span class="tl-date-text">${text}</span>
              <span class="tl-date-rel">${rel}</span>
            </div>
            <div class="tl-events">
              ${evts.map((e) => renderTimelineEvent(e)).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderTimelineEvent({ kind, a }) {
  const k = TIMELINE_KINDS[kind];
  const memberHTML = a.member_id
    ? `<span class="member-chip" style="background:${escapeHtml(a.member_color)}">${escapeHtml(a.member_name)}</span>`
    : '';
  const rate = a.interest_rate != null && a.interest_rate !== '' ? ` · ${escapeHtml(String(a.interest_rate))}%` : '';

  // Event amount: for lãi events, server-computed pnl already equals one cycle
  // of interest for monthly/quarterly assets (see computeAssetMetrics), signed
  // negative for đi vay. Maturity events show the asset value (payout / debt).
  const interestAmt = kind !== 'maturity' && a.pnl ? Math.abs(a.pnl) : null;
  const amountHTML = interestAmt != null
    ? `<div class="tl-event-value ${kind === 'pay' ? 'neg' : 'pos'}">
         ${kind === 'pay' ? '−' : '+'}${fmtVND(interestAmt)}
         <div class="muted-sm">Giá trị: ${fmtVND(a.value)}</div>
       </div>`
    : `<div class="tl-event-value">${fmtVND(a.value)}</div>`;

  return `
    <div class="tl-event">
      <span class="tl-event-icon">${k.icon}</span>
      <div class="tl-event-main">
        <div class="ar-name-line">${memberHTML}<strong>${escapeHtml(a.name)}</strong></div>
        <div class="muted-sm">${k.label} · ${escapeHtml(a.group_icon)} ${escapeHtml(a.group_name)}${rate}</div>
      </div>
      ${amountHTML}
    </div>
  `;
}

// ── Pagination ────────────────────────────────────────────────────────────────

function renderPagination(total, currentPage) {
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const pages = Array.from({ length: pageCount }, (_, i) =>
    `<button class="small secondary${i === currentPage ? ' active' : ''}" data-page="${i}">${i + 1}</button>`
  ).join('');
  return `
    <div class="pagination">
      <button class="small secondary" data-page="${currentPage - 1}" ${currentPage === 0 ? 'disabled' : ''}>‹ Trước</button>
      ${pages}
      <button class="small secondary" data-page="${currentPage + 1}" ${currentPage === pageCount - 1 ? 'disabled' : ''}>Sau ›</button>
    </div>
  `;
}

// ── Column header ─────────────────────────────────────────────────────────────

function renderListHeader(showGroup) {
  return `
    <div class="asset-list-header">
      <div class="ar-name">Tên</div>
      <div class="ar-meta">${showGroup ? 'Nhóm / Loại' : 'Loại'}</div>
      <div class="ar-value">Giá trị</div>
      <div class="ar-pnl">Lãi / Lỗ</div>
      <div class="ar-liquid">Khả dụng</div>
      <div class="ar-actions"></div>
    </div>
  `;
}

// ── Asset row (div + CSS grid, no horizontal scroll on mobile) ────────────────

function renderAssetRow(a, showGroup) {
  const hideQty = ['bank', 'tien-gui', 'cho-vay', 'di-vay'].includes(a.group_id);
  const qty = hideQty ? '' : `${a.qty || 0} ${escapeHtml(a.unit || '')}`;

  const typeLabel = showGroup
    ? `${escapeHtml(a.group_icon)} ${escapeHtml(a.group_name)}${a.subtype_name ? ` · ${escapeHtml(a.subtype_name)}` : ''}`
    : (a.subtype_name ? escapeHtml(a.subtype_name) : '');

  const memberHTML = a.member_id
    ? `<span class="member-chip" style="background:${escapeHtml(a.member_color)}">${escapeHtml(a.member_name)}</span>`
    : '';

  return `
    <div class="asset-row" data-id="${a.id}">
      <div class="ar-name">
        <div class="ar-name-line">${memberHTML}<strong>${escapeHtml(a.name)}</strong></div>
        ${subInfoLine(a)}
      </div>
      <div class="ar-meta">
        ${typeLabel ? `<div class="ar-type">${typeLabel}</div>` : ''}
        ${qty ? `<div class="ar-qty-line">${qty}</div>` : ''}
      </div>
      <div class="ar-value">
        <strong>${fmtVND(a.value)}</strong>
        ${a.cost != null && a.cost !== a.value ? `<div class="muted-sm">${fmtVND(a.cost)}</div>` : ''}
      </div>
      <div class="ar-pnl ${a.pnl == null ? '' : (a.pnl >= 0 ? 'pos' : 'neg')}">
        ${fmtVND(a.pnl)}<br/><small>${fmtPct(a.pnlPct)}</small>
      </div>
      <div class="ar-liquid">${isLiquid(a)
        ? '<span class="badge pos">Khả dụng</span>'
        : '<span class="badge warn">Chưa khả dụng</span>'
      }</div>
      <div class="ar-actions">
        <button class="small secondary icon-btn" data-act="share" title="Chia sẻ ảnh" aria-label="Chia sẻ ảnh">${SHARE_ICON}</button>
        <button class="small secondary" data-act="edit">Sửa</button>
        <button class="small danger" data-act="del">Xoá</button>
      </div>
    </div>
  `;
}

function stripSrcPrefix(notes) {
  if (!notes) return null;
  const m = notes.match(/^__src:([^:]+):[^|]+\|(.+)$/);
  return m ? `source:${m[1].toUpperCase()} · ${m[2]}` : notes;
}

function maturityChip(maturityDate) {
  if (!maturityDate) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mat = new Date(maturityDate);
  mat.setHours(0, 0, 0, 0);
  const diffDays = Math.round((mat - today) / 86400000);
  if (diffDays < 0) return `<span class="badge neg">Quá hạn: ${Math.abs(diffDays)} ngày</span>`;
  if (diffDays === 0) return `<span class="badge pos">Đáo hạn hôm nay</span>`;
  if (diffDays <= maturityWarnDays) return `<span class="badge warn">Sắp đáo hạn: ${diffDays} ngày</span>`;
  return '';
}

function subInfoLine(a) {
  const bits = [];
  if (a.group_id === 'bank' && a.bank) bits.push(formatBank(a.bank));
  if (a.group_id === 'tien-gui' && a.platform) bits.push(a.platform);
  if (a.term) bits.push(`Kỳ hạn: ${a.term} tháng`);
  if (a.interest_rate != null && a.interest_rate !== '') bits.push(a.interest_rate + '%');
  const notes = stripSrcPrefix(a.notes);
  if (notes) bits.push(notes);
  const textPart = bits.map(escapeHtml).join(' · ');
  const datePart = a.maturity_date ? `Đáo hạn: ${escapeHtml(a.maturity_date)}` : '';
  const nextPay = nextInterestPaymentDate(a);
  const nextPart = nextPay ? `Trả lãi tiếp theo: ${escapeHtml(nextPay)}` : '';
  const chips = [maturityChip(a.maturity_date), interestPaymentChip(a, nextPay)].filter(Boolean).join(' ');
  const parts = [textPart, datePart, nextPart].filter(Boolean).join(' · ');
  if (!parts && !chips) return '';
  return `<div class="muted-sm">${parts}${parts && chips ? ' ' : ''}${chips}</div>`;
}

function interestPaymentChip(a, nextPay) {
  if (!nextPay) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(nextPay);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / 86400000);
  if (diffDays < 0 || diffDays > maturityWarnDays) return '';
  const isPay = a.group_id === 'di-vay';
  const action = isPay ? 'trả lãi' : 'nhận lãi';
  const Action = isPay ? 'Trả lãi' : 'Nhận lãi';
  if (diffDays === 0) {
    return `<span class="badge ${isPay ? 'warn' : 'pos'}">${Action} hôm nay</span>`;
  }
  return `<span class="badge warn">Sắp ${action}: ${diffDays} ngày</span>`;
}

function bindRowActions(assets, members, reload) {
  document.querySelectorAll('#asset-list .asset-group-header').forEach((header) => {
    header.onclick = () => header.closest('.asset-group-section').classList.toggle('collapsed');
    const shareBtn = header.querySelector('[data-act="share-group"]');
    if (shareBtn) {
      shareBtn.onclick = (e) => {
        e.stopPropagation();
        const gid = header.closest('.asset-group-section').dataset.groupId;
        const group = findGroup(gid);
        const items = assets.filter((a) => a.group_id === gid);
        if (group) shareGroup(group, items);
      };
    }
  });

  document.querySelectorAll('#asset-list .asset-row[data-id]').forEach((row) => {
    const id = Number(row.dataset.id);
    const asset = assets.find((a) => a.id === id);
    row.querySelector('[data-act="share"]').onclick = () => shareAsset(asset);
    row.querySelector('[data-act="edit"]').onclick = () => openAssetModal(asset, members, reload);
    row.querySelector('[data-act="del"]').onclick = () => {
      openModal(`
        <h3>Xoá tài sản</h3>
        <p>Xoá "<strong>${escapeHtml(asset.name)}</strong>"?</p>
        <div class="form-grid">
          <label class="full">Ghi chú
            <textarea id="del-notes" rows="2" placeholder="Lý do xoá..."></textarea>
          </label>
        </div>
        <div class="modal-actions full">
          <button type="button" class="secondary" id="del-cancel">Huỷ</button>
          <button type="button" class="danger" id="del-confirm">Xoá</button>
        </div>
      `, (root) => {
        root.querySelector('#del-cancel').onclick = closeModal;
        root.querySelector('#del-confirm').onclick = async () => {
          const delBtn = root.querySelector('#del-confirm');
          delBtn.disabled = true;
          delBtn.classList.add('btn-loading');
          const notes = root.querySelector('#del-notes').value.trim() || null;
          try {
            await api.del('/assets/' + id, notes ? { notes } : undefined);
            toast('Đã xoá');
            closeModal();
            await reload();
          } catch (err) {
            delBtn.disabled = false;
            delBtn.classList.remove('btn-loading');
            toast('Lỗi: ' + err.message);
          }
        };
      });
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Modal — group selector swaps the entire form body
// ────────────────────────────────────────────────────────────────────────────

async function openAssetModal(asset, members, reload) {
  const editing = !!asset;
  const initialGroup = asset?.group_id || ASSET_GROUPS[0]?.id || '';

  openModal(`
    <h3>${editing ? 'Sửa tài sản' : 'Thêm tài sản'}</h3>
    <div class="form-grid" style="margin-bottom: 8px;">
      <label class="full">Nhóm
        <select id="a-group" ${editing ? 'disabled' : ''}>
          ${ASSET_GROUPS.map((g) => `<option value="${escapeHtml(g.id)}" ${g.id === initialGroup ? 'selected' : ''}>${escapeHtml(g.icon)} ${escapeHtml(g.name)}</option>`).join('')}
        </select>
      </label>
    </div>
    <div id="form-body"></div>
  `, async (root) => {
    const groupSelect = root.querySelector('#a-group');
    const formBody = root.querySelector('#form-body');

    const mount = async (groupId) => {
      formBody.innerHTML = '<div class="loading">Đang tải...</div>';
      const subtypes = findGroup(groupId)?.subtypes || [];
      const platforms = groupId === 'tien-gui' ? await api.get('/platforms') : [];
      formBody.innerHTML = renderGroupForm(groupId, subtypes, platforms, members, asset);
      bindBankSelect(formBody);
      bindMoneyInputs(formBody);
      bindFormBehaviour(groupId, formBody);
      bindSubmit(groupId, formBody, asset, editing, reload);
    };

    groupSelect.addEventListener('change', () => mount(groupSelect.value));
    await mount(initialGroup);
  });
}

function renderGroupForm(groupId, subtypes, platforms, members, asset) {
  switch (groupId) {
    case 'dau-tu':   return formDauTu(subtypes, members, asset);
    case 'tich-tru': return formTichTru(subtypes, members, asset);
    case 'cho-vay':  return formChoVay(subtypes, members, asset);
    case 'di-vay':   return formDiVay(subtypes, members, asset);
    case 'tien-gui': return formTienGui(subtypes, platforms, members, asset);
    case 'bank':     return formBank(subtypes, members, asset);
  }
}

// Shared sub-fragments ─────────────────────────────────────────────────────
function fragMember(members, asset) {
  return `
    <label>Người nắm giữ
      <select name="member_id">
        <option value="">— Không —</option>
        ${members.map((m) => `<option value="${m.id}" ${asset?.member_id === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
      </select>
    </label>
  `;
}
function fragSubtype(subtypes, asset, label = 'Loại') {
  return `
    <label>${escapeHtml(label)}
      <select name="subtype">
        <option value="">— Không —</option>
        ${subtypes.map((s) => `<option value="${escapeHtml(s.id)}" ${asset?.subtype === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
      </select>
    </label>
  `;
}
function fragNotes(asset) {
  return `
    <label class="full">Ghi chú
      <textarea name="notes" rows="2">${escapeHtml(asset?.notes || '')}</textarea>
    </label>
  `;
}
function fragActions(editing) {
  return `
    <div class="modal-actions full">
      <button type="button" class="secondary" id="cancel">Huỷ</button>
      <button type="submit">${editing ? 'Cập nhật' : 'Tạo'}</button>
    </div>
  `;
}

// ─── Đầu tư ────────────────────────────────────────────────────────────────
function formDauTu(subtypes, members, asset) {
  const a = asset || {};
  return `<form id="asset-form" class="form-grid">
    <label class="full">Mã / Tên quỹ
      <input name="name" required value="${escapeHtml(a.name || '')}" placeholder="VD: VNM, FPT, BTC, VESAF" />
    </label>
    ${fragSubtype(subtypes, a)}
    ${fragMember(members, a)}
    <label>Số lượng
      <input name="qty" type="number" step="any" value="${a.qty ?? 0}" />
    </label>
    <label>Đơn vị
      <input name="unit" value="${escapeHtml(a.unit || '')}" placeholder="cp, BTC, CCQ..." />
    </label>
    <label>Giá vốn / đơn vị
      <input name="cost_price" type="text" inputmode="numeric" data-money value="${a.cost_price ?? 0}" />
    </label>
    <label>Giá hiện tại / đơn vị
      <input name="current_price" type="text" inputmode="numeric" data-money value="${a.current_price ?? 0}" />
    </label>
    <label data-bond-field>Ngày đáo hạn
      <input name="maturity_date" type="date" value="${escapeHtml(a.maturity_date || '')}" />
    </label>
    <label class="full">Mã ticker <span class="muted-sm">(để lấy giá tự động sau này)</span>
      <input name="ticker" value="${escapeHtml(a.ticker || '')}" placeholder="VD: VNM, bitcoin, VESAF" />
    </label>
    ${fragNotes(a)}
    ${fragActions(!!asset)}
  </form>`;
}

// ─── Tích trữ ──────────────────────────────────────────────────────────────
function formTichTru(subtypes, members, asset) {
  const a = asset || {};
  return `<form id="asset-form" class="form-grid">
    <label class="full">Tên tài sản
      <input name="name" required value="${escapeHtml(a.name || '')}" placeholder="VD: SJC 1 chỉ, Đất Hà Đông..." />
    </label>
    ${fragSubtype(subtypes, a)}
    ${fragMember(members, a)}
    <label>Số lượng
      <input name="qty" type="number" step="any" value="${a.qty ?? 0}" />
    </label>
    <label>Đơn vị
      <input name="unit" value="${escapeHtml(a.unit || '')}" placeholder="USD, lượng, chỉ, m²..." list="unit-suggestions" />
      <datalist id="unit-suggestions">
        <option value="USD"></option>
        <option value="lượng"></option>
        <option value="chỉ"></option>
        <option value="m²"></option>
      </datalist>
    </label>
    <label>Giá vốn / đơn vị
      <input name="cost_price" type="text" inputmode="numeric" data-money value="${a.cost_price ?? 0}" />
    </label>
    <label>Giá hiện tại / đơn vị
      <input name="current_price" type="text" inputmode="numeric" data-money value="${a.current_price ?? 0}" />
    </label>
    ${fragNotes(a)}
    ${fragActions(!!asset)}
  </form>`;
}

// ─── Cho vay ───────────────────────────────────────────────────────────────
function formChoVay(subtypes, members, asset) {
  const a = asset || {};
  return `<form id="asset-form" class="form-grid">
    <label>Tên / Người vay
      <input name="name" required value="${escapeHtml(a.name || '')}" placeholder="VD: Phước, a Sơn..." />
    </label>
    ${fragSubtype(subtypes, a)}
    ${fragMember(members, a)}
    <label>Số tiền cho vay gốc
      <input name="cost_price" type="text" inputmode="numeric" data-money value="${a.cost_price ?? 0}" />
    </label>
    <label>Số tiền cho vay còn lại
      <input name="current_price" type="text" inputmode="numeric" data-money value="${a.current_price ?? a.cost_price ?? 0}" />
    </label>
    <label>Lãi suất (%/năm)
      <input name="interest_rate" type="number" step="any" value="${a.interest_rate ?? ''}" />
    </label>
    <label>Ngày cho vay
      <input name="start_date" type="date" value="${escapeHtml(a.start_date || '')}" />
    </label>
    <label>Ngày đáo hạn
      <input name="maturity_date" type="date" value="${escapeHtml(a.maturity_date || '')}" />
    </label>
    ${fragInterestPayment(a)}
    <input type="hidden" name="qty" value="1" />
    <input type="hidden" name="unit" value="VND" />
    ${fragNotes(a)}
    ${fragActions(!!asset)}
  </form>`;
}

// ─── Đi vay ────────────────────────────────────────────────────────────────
function formDiVay(subtypes, members, asset) {
  const a = asset || {};
  return `<form id="asset-form" class="form-grid">
    <label>Tên / Chủ nợ
      <input name="name" required value="${escapeHtml(a.name || '')}" placeholder="VD: Vay xe TCB, mượn anh A..." />
    </label>
    ${fragSubtype(subtypes, a)}
    ${fragMember(members, a)}
    <label>Số tiền vay gốc
      <input name="cost_price" type="text" inputmode="numeric" data-money value="${a.cost_price ?? 0}" />
    </label>
    <label>Dư nợ hiện tại
      <input name="current_price" type="text" inputmode="numeric" data-money value="${a.current_price ?? a.cost_price ?? 0}" />
    </label>
    <label>Lãi suất (%/năm)
      <input name="interest_rate" type="number" step="any" value="${a.interest_rate ?? ''}" />
    </label>
    <label>Ngày vay
      <input name="start_date" type="date" value="${escapeHtml(a.start_date || '')}" />
    </label>
    <label>Ngày đáo hạn
      <input name="maturity_date" type="date" value="${escapeHtml(a.maturity_date || '')}" />
    </label>
    ${fragInterestPayment(a)}
    <input type="hidden" name="qty" value="1" />
    <input type="hidden" name="unit" value="VND" />
    ${fragNotes(a)}
    ${fragActions(!!asset)}
  </form>`;
}

function fragInterestPayment(a, { attr = '' } = {}) {
  const cycle = a.interest_payment_cycle || 'end_of_term';
  const opts = [
    ['end_of_term', 'Cuối kỳ'],
    ['monthly',     'Hằng tháng'],
    ['quarterly',   'Hằng quý'],
  ].map(([v, label]) =>
    `<option value="${v}" ${cycle === v ? 'selected' : ''}>${label}</option>`
  ).join('');
  return `
    <label ${attr}>Chu kỳ trả lãi
      <select name="interest_payment_cycle">${opts}</select>
    </label>
    <label ${attr}>Ngày trả lãi (1-31)
      <input name="interest_payment_day" type="number" min="1" max="31"
             value="${a.interest_payment_day ?? ''}" />
    </label>
    <label ${attr} data-include-maturity class="check-label full">
      <input type="checkbox" name="interest_include_maturity" value="1"
             ${a.interest_include_maturity ? 'checked' : ''} />
      Lãi bao gồm ngày đáo hạn
    </label>`;
}

// ─── Tiền gửi ──────────────────────────────────────────────────────────────
function formTienGui(subtypes, platforms, members, asset) {
  const a = asset || {};
  return `<form id="asset-form" class="form-grid">
    <label class="full">Tên gói gửi
      <input name="name" required value="${escapeHtml(a.name || '')}" placeholder="VD: TG TCB 6 tháng..." />
    </label>
    ${fragSubtype(subtypes, a)}
    <label>Nền tảng
      ${platformSelectHTML('platform', a.platform, platforms)}
    </label>
    ${fragMember(members, a)}
    <label>Số tiền gửi
      <input name="cost_price" type="text" inputmode="numeric" data-money value="${a.cost_price ?? 0}" />
    </label>
    <label>Lãi suất (%/năm)
      <input name="interest_rate" type="number" step="any" value="${a.interest_rate ?? ''}" />
    </label>
    <label>Thuế lãi (%)
      <input name="interest_tax_rate" type="number" step="any" value="${a.interest_tax_rate ?? 5}" />
    </label>
    <label>Ngày gửi
      <input name="start_date" type="date" data-term-trio="start" value="${escapeHtml(a.start_date || '')}" />
    </label>
    <label>Ngày đáo hạn
      <input name="maturity_date" type="date" data-term-trio="mat" value="${escapeHtml(a.maturity_date || '')}" />
    </label>
    <label>Kỳ hạn (tháng)
      <input name="term" type="number" min="1" step="1" data-term-trio="term" value="${escapeHtml(a.term || '')}" />
    </label>
    ${fragInterestPayment(a)}
    <input type="hidden" name="qty" value="1" />
    <input type="hidden" name="unit" value="VND" />
    ${fragNotes(a)}
    ${fragActions(!!asset)}
  </form>`;
}

// ─── Bank ──────────────────────────────────────────────────────────────────
function formBank(subtypes, members, asset) {
  const a = asset || {};
  return `<form id="asset-form" class="form-grid">
    <label class="full">Tên gọi tài khoản
      <input name="name" required value="${escapeHtml(a.name || '')}" placeholder="VD: Lương TCB, Tiết kiệm VCB..." />
    </label>
    ${fragSubtype(subtypes, a, 'Loại tài khoản')}
    <label class="full">Ngân hàng
      ${bankSelectHTML('bank', a.bank)}
    </label>
    ${fragMember(members, a)}
    <label class="full">Số tài khoản
      <input name="notes" value="${escapeHtml(a.notes || '')}" placeholder="Tuỳ chọn" />
    </label>
    <label class="full">Số dư hiện tại
      <input name="current_price" type="text" inputmode="numeric" data-money value="${a.current_price ?? 0}" />
    </label>
    <label>Lãi suất (%/năm)
      <input name="interest_rate" type="number" step="any" value="${a.interest_rate ?? ''}" />
    </label>
    <label>Ngày gửi
      <input name="start_date" type="date" data-term-trio="start" value="${escapeHtml(a.start_date || '')}" />
    </label>
    <label data-bank-savings>Ngày đáo hạn
      <input name="maturity_date" type="date" data-term-trio="mat" value="${escapeHtml(a.maturity_date || '')}" />
    </label>
    <label data-bank-savings>Kỳ hạn (tháng)
      <input name="term" type="number" min="1" step="1" data-term-trio="term" value="${escapeHtml(a.term || '')}" />
    </label>
    ${fragInterestPayment(a, { attr: 'data-bank-savings' })}
    <input type="hidden" name="qty" value="1" />
    <input type="hidden" name="cost_price" value="${a.cost_price ?? 0}" />
    <input type="hidden" name="unit" value="VND" />
    ${fragActions(!!asset)}
  </form>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Form behaviour
// ────────────────────────────────────────────────────────────────────────────
function bindFormBehaviour(groupId, formBody) {
  bindIncludeMaturityToggle(formBody);
  if (groupId === 'tien-gui') {
    bindTermTrio(formBody);
    return;
  }
  if (groupId === 'dau-tu') {
    const subtypeEl = formBody.querySelector('select[name="subtype"]');
    const bondFields = formBody.querySelectorAll('[data-bond-field]');
    if (!subtypeEl || !bondFields.length) return;
    const toggle = () => {
      const show = subtypeEl.value === 'trai-phieu';
      bondFields.forEach((el) => { el.style.display = show ? '' : 'none'; });
    };
    subtypeEl.addEventListener('change', toggle);
    toggle();
    return;
  }
  if (groupId !== 'bank') return;

  const subtypeEl = formBody.querySelector('select[name="subtype"]');
  const savingsEls = formBody.querySelectorAll('[data-bank-savings]');
  bindTermTrio(formBody);
  if (!subtypeEl || !savingsEls.length) return;

  const toggle = () => {
    const hide = subtypeEl.value !== BANK_SAVINGS_SUBTYPE;
    savingsEls.forEach((el) => { el.toggleAttribute('data-subtype-hidden', hide); });
  };
  subtypeEl.addEventListener('change', toggle);
  toggle();
}

// "Lãi bao gồm ngày đáo hạn" only applies to end-of-term interest — hide it
// for other cycles. Show/hide conditions each own a data attribute
// (data-cycle-hidden, data-subtype-hidden); a label is hidden while any is
// present, so independent toggles on the same label don't overwrite each other.
function bindIncludeMaturityToggle(formBody) {
  const cycleEl = formBody.querySelector('select[name="interest_payment_cycle"]');
  const label = formBody.querySelector('[data-include-maturity]');
  if (!cycleEl || !label) return;
  const toggle = () => {
    label.toggleAttribute('data-cycle-hidden', cycleEl.value !== 'end_of_term');
  };
  cycleEl.addEventListener('change', toggle);
  toggle();
}

// ─── Term/date trio ──────────────────────────────────────────────────────────
function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
function monthsBetween(startStr, endStr) {
  const s = new Date(startStr);
  const e = new Date(endStr);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
  let m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() < s.getDate()) m -= 1;
  return m > 0 ? String(m) : '';
}
function bindTermTrio(formBody) {
  const startEl = formBody.querySelector('[data-term-trio="start"]');
  const matEl   = formBody.querySelector('[data-term-trio="mat"]');
  const termEl  = formBody.querySelector('[data-term-trio="term"]');
  if (!startEl || !matEl || !termEl) return;

  const recompute = (changed) => {
    const start = startEl.value;
    const mat = matEl.value;
    const termRaw = termEl.value.trim();
    const term = termRaw ? parseInt(termRaw, 10) : null;

    if (changed === 'start' && start) {
      if (term) matEl.value = addMonths(start, term);
      else if (mat) termEl.value = monthsBetween(start, mat);
    } else if (changed === 'mat' && mat) {
      if (term) startEl.value = addMonths(mat, -term);
      else if (start) termEl.value = monthsBetween(start, mat);
    } else if (changed === 'term' && term) {
      if (start) matEl.value = addMonths(start, term);
      else if (mat) startEl.value = addMonths(mat, -term);
    }
  };

  startEl.addEventListener('change', () => recompute('start'));
  matEl.addEventListener('change', () => recompute('mat'));
  termEl.addEventListener('input', () => recompute('term'));
}

// ────────────────────────────────────────────────────────────────────────────
// Submit handler
// ────────────────────────────────────────────────────────────────────────────
function bindSubmit(groupId, formBody, asset, editing, reload) {
  const form = formBody.querySelector('#asset-form');
  const cancelBtn = formBody.querySelector('#cancel');
  cancelBtn.onclick = closeModal;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.classList.add('btn-loading');
    const fd = new FormData(form);
    const body = { group_id: groupId };
    for (const [k, v] of fd.entries()) body[k] = v === '' ? null : v;
    parseMoneyPayload(body, MONEY_FIELDS);

    // Unchecked checkboxes are absent from FormData — send explicit 0/1.
    if (form.querySelector('[name="interest_include_maturity"]')) {
      body.interest_include_maturity = fd.has('interest_include_maturity') ? 1 : 0;
    }

    if (groupId === 'tien-gui') {
      body.current_price = body.cost_price;
    }
    if (groupId === 'bank' && body.subtype !== BANK_SAVINGS_SUBTYPE) {
      body.maturity_date = null;
      body.term = null;
      body.interest_payment_cycle = null;
      body.interest_payment_day = null;
      body.interest_include_maturity = 0;
    }

    try {
      if (editing) await api.put('/assets/' + asset.id, body);
      else await api.post('/assets', body);
      toast(editing ? 'Đã cập nhật' : 'Đã thêm');
      closeModal();
      await reload();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn-loading');
      toast('Lỗi: ' + err.message);
    }
  };
}
