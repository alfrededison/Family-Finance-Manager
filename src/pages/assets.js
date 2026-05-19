import { api } from '../api.js';
import { fmtVND, fmtPct, escapeHtml, openModal, closeModal, toast, rerender, bindMoneyInputs, parseMoneyPayload } from '../main.js';
import { bankSelectHTML, bindBankSelect } from '../components/bank-select.js';
import { platformSelectHTML } from '../components/platform-select.js';
import { formatBank } from '../data/banks.js';
import { ASSET_GROUPS, findGroup, enrichAsset, isLiquid } from '../data/groups.js';

const MONEY_FIELDS = ['cost_price', 'current_price'];
const BANK_SAVINGS_SUBTYPE = 'so-tiet-kiem';
const PAGE_SIZE = 20;

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

  const [rawAll, members] = await Promise.all([
    fetchAssets(initQ, initGroup, initMember),
    api.get('/members'),
  ]);

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
        <select id="f-group">
          <option value="">Tất cả nhóm</option>
          ${ASSET_GROUPS.map((g) => `<option value="${escapeHtml(g.id)}" ${g.id === initGroup ? 'selected' : ''}>${escapeHtml(g.icon)} ${escapeHtml(g.name)}</option>`).join('')}
        </select>
        <select id="f-member">
          <option value="">Tất cả thành viên</option>
          ${members.map((m) => `<option value="${m.id}" ${String(m.id) === initMember ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
        </select>
        <select id="f-available">
          <option value=""  ${initAvailable === ''  ? 'selected' : ''}>Tất cả</option>
          <option value="1" ${initAvailable === '1' ? 'selected' : ''}>Khả dụng</option>
          <option value="0" ${initAvailable === '0' ? 'selected' : ''}>Chưa khả dụng</option>
        </select>
        <select id="f-sort">
          <option value="id-desc"      ${initSort === 'id-desc'      ? 'selected' : ''}>Mặc định</option>
          <option value="maturity-asc" ${initSort === 'maturity-asc' ? 'selected' : ''}>Đáo hạn sớm nhất</option>
          <option value="value-desc"   ${initSort === 'value-desc'   ? 'selected' : ''}>Giá trị cao nhất</option>
          <option value="pnl-desc"     ${initSort === 'pnl-desc'     ? 'selected' : ''}>Lãi cao nhất</option>
        </select>
        <div class="view-toggle">
          <button id="f-view-grouped" class="small secondary ${initView === 'grouped' ? 'active' : ''}">Nhóm</button>
          <button id="f-view-flat"    class="small secondary ${initView === 'flat'    ? 'active' : ''}">Danh sách</button>
        </div>
      </div>

      <div id="asset-list"></div>
    </div>
  `;

  let filterTimer;
  let cachedAll = allAssets;
  let currentAssets = assets;
  let currentPage = 0;

  const getViewMode = () =>
    document.getElementById('f-view-grouped').classList.contains('active') ? 'grouped' : 'flat';
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
    const sorted = sortAssets(currentAssets, getSort());
    const vw = getViewMode();
    document.getElementById('asset-list').innerHTML =
      renderSummaryBar(currentAssets) +
      (vw === 'grouped'
        ? renderGroupedView(sorted)
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
    currentPage = 0;
    syncURL();
    redisplay();
  };
  document.getElementById('f-view-grouped').onclick = () => setView('grouped');
  document.getElementById('f-view-flat').onclick    = () => setView('flat');
}

// ── Sort ──────────────────────────────────────────────────────────────────────

function sortAssets(assets, sortBy) {
  const copy = [...assets];
  const matKey = (a) => a.maturity_date || '9999-99-99';
  if (sortBy === 'maturity-asc') return copy.sort((a, b) => matKey(a).localeCompare(matKey(b)));
  if (sortBy === 'value-desc')   return copy.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  if (sortBy === 'pnl-desc')     return copy.sort((a, b) => (b.pnl ?? -Infinity) - (a.pnl ?? -Infinity));
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
        <div class="asset-group-section">
          <div class="asset-group-header">
            <span class="group-header-title"><span class="group-chevron">▾</span> ${escapeHtml(g.icon)} ${escapeHtml(g.name)} <span class="muted-sm">(${items.length})</span></span>
            <span class="group-header-totals">
              <span class="group-total-value">${fmtVND(subtotal)}</span>
              <span class="group-total-pnl ${pnlClass}">${pnlSign}${fmtVND(subtotalPnl)}</span>
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
  if (diffDays <= 3) return `<span class="badge warn">Sắp đáo hạn: ${diffDays} ngày</span>`;
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
  const chip = maturityChip(a.maturity_date);
  const parts = [textPart, datePart].filter(Boolean).join(' · ');
  if (!parts && !chip) return '';
  return `<div class="muted-sm">${parts}${parts && chip ? ' ' : ''}${chip}</div>`;
}

function bindRowActions(assets, members, reload) {
  document.querySelectorAll('#asset-list .asset-group-header').forEach((header) => {
    header.onclick = () => header.closest('.asset-group-section').classList.toggle('collapsed');
  });

  document.querySelectorAll('#asset-list .asset-row[data-id]').forEach((row) => {
    const id = Number(row.dataset.id);
    const asset = assets.find((a) => a.id === id);
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
    <input type="hidden" name="qty" value="1" />
    <input type="hidden" name="unit" value="VND" />
    ${fragNotes(a)}
    ${fragActions(!!asset)}
  </form>`;
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
    const show = subtypeEl.value === BANK_SAVINGS_SUBTYPE;
    savingsEls.forEach((el) => { el.style.display = show ? '' : 'none'; });
  };
  subtypeEl.addEventListener('change', toggle);
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

    if (groupId === 'tien-gui') {
      body.current_price = body.cost_price;
    }
    if (groupId === 'bank' && body.subtype !== BANK_SAVINGS_SUBTYPE) {
      body.maturity_date = null;
      body.term = null;
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
