import { api } from '../api.js';
import { fmtVND, escapeHtml } from '../main.js';
import { enrichAsset } from '../data/groups.js';

const PAGE_SIZE = 50;
const DROPDOWN_LIMIT = 50;

export async function renderPriceHistory(view) {
  const rawAssets = await api.get('/assets');
  const assets = rawAssets.map(enrichAsset);

  view.innerHTML = `
    <div class="page-header">
      <h1>📋 Lịch sử tài sản</h1>
    </div>

    <div class="section">
      <div class="toolbar">
        ${searchableAssetDropdown(assets)}
        <select id="f-type" style="min-width:140px;">
          <option value="">Tất cả loại</option>
          <option value="create">Tạo mới</option>
          <option value="edit">Cập nhật</option>
          <option value="delete">Xoá</option>
        </select>
      </div>

      <div id="ph-list"></div>
      <div id="ph-pagination" class="pagination"></div>
    </div>
  `;

  let currentPage = 1;

  const load = async () => {
    const asset = document.getElementById('f-asset-val').value;
    const type  = document.getElementById('f-type').value;
    const params = new URLSearchParams({ page: currentPage, limit: PAGE_SIZE });
    if (asset) params.set('asset', asset);
    if (type)  params.set('type', type);

    document.getElementById('ph-list').innerHTML = '<div class="loading">Đang tải...</div>';
    const { rows, total } = await api.get('/price-history?' + params.toString());
    document.getElementById('ph-list').innerHTML = renderTable(rows);
    renderPagination(total);
  };

  function renderPagination(total) {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const el = document.getElementById('ph-pagination');
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <button id="pg-prev" ${currentPage <= 1 ? 'disabled' : ''}>← Trước</button>
      <span>Trang ${currentPage} / ${totalPages} (${total} bản ghi)</span>
      <button id="pg-next" ${currentPage >= totalPages ? 'disabled' : ''}>Sau →</button>
    `;
    el.querySelector('#pg-prev').onclick = () => { currentPage--; load(); };
    el.querySelector('#pg-next').onclick = () => { currentPage++; load(); };
  }

  document.getElementById('f-type').onchange = () => { currentPage = 1; load(); };

  bindAssetDropdown(assets, () => { currentPage = 1; load(); });

  load();
}

// ────────────────────────────────────────────────────────────────────────────
// Searchable asset dropdown
// ────────────────────────────────────────────────────────────────────────────

function searchableAssetDropdown(assets) {
  return `
    <div class="bank-select" data-asset-select style="flex:1; min-width:200px;">
      <input type="hidden" id="f-asset-val" value="" />
      <input type="text" id="f-asset-search"
             placeholder="Tất cả tài sản"
             autocomplete="off"
             style="width:100%;" />
      <div class="bank-results" id="f-asset-results" role="listbox" hidden></div>
    </div>
  `;
}

function bindAssetDropdown(assets, onChange) {
  const hiddenInput = document.getElementById('f-asset-val');
  const search      = document.getElementById('f-asset-search');
  const results     = document.getElementById('f-asset-results');

  const renderList = (query) => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? assets.filter((a) => a.name.toLowerCase().includes(q) || (a.group_name || '').toLowerCase().includes(q))
      : assets;

    const shown = matched.slice(0, DROPDOWN_LIMIT);
    const hasMore = matched.length > DROPDOWN_LIMIT;

    let html = `<div class="bank-row" data-val="" data-label="Tất cả tài sản">Tất cả tài sản</div>`;
    html += shown.map((a) => `
      <div class="bank-row" data-val="${a.id}" data-label="${escapeHtml(a.name)}">
        ${escapeHtml(a.group_icon)} ${escapeHtml(a.name)}
      </div>
    `).join('');

    if (!q && assets.length > DROPDOWN_LIMIT) {
      html += `<div class="bank-row" style="color:var(--muted); font-style:italic; cursor:default;">... (${assets.length} tài sản, hãy tìm kiếm)</div>`;
    } else if (hasMore) {
      html += `<div class="bank-row" style="color:var(--muted); font-style:italic; cursor:default;">... tìm thấy ${matched.length} kết quả, hãy thu hẹp tìm kiếm</div>`;
    }

    results.innerHTML = html;
    results.hidden = false;
  };

  search.addEventListener('focus', () => renderList(search.value));
  search.addEventListener('input', () => {
    hiddenInput.value = '';
    renderList(search.value);
  });
  search.addEventListener('blur', () => {
    setTimeout(() => { results.hidden = true; }, 150);
  });

  results.addEventListener('mousedown', (e) => {
    const row = e.target.closest('.bank-row[data-val]');
    if (!row) return;
    hiddenInput.value = row.dataset.val;
    search.value = row.dataset.val ? row.dataset.label : '';
    results.hidden = true;
    onChange();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Table rendering
// ────────────────────────────────────────────────────────────────────────────

function fmtType(type) {
  if (type === 'create') return '<span class="badge pos">Tạo mới</span>';
  if (type === 'delete') return '<span class="badge danger">Xoá</span>';
  if (type === 'edit')   return '<span class="badge neutral">Cập nhật</span>';
  return `<span class="badge neutral">${escapeHtml(type || '')}</span>`;
}

function fmtSource(source) {
  if (!source || source === 'manual') return '<span class="badge neutral">thủ công</span>';
  if (source.startsWith('market:')) {
    const provider = source.slice('market:'.length);
    return `<span class="badge info">${escapeHtml(provider)}</span>`;
  }
  return `<span class="badge neutral">${escapeHtml(source)}</span>`;
}

function fmtDatetime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function renderTable(rows) {
  if (!rows.length) return '<div class="empty">Chưa có dữ liệu lịch sử nào</div>';
  return `
    <div class="table-wrap"><table>
      <thead>
        <tr>
          <th>Tài sản</th>
          <th class="num">Giá</th>
          <th>Loại</th>
          <th>Nguồn</th>
          <th>Ghi chú</th>
          <th>Thời gian</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${escapeHtml(r.asset_name)}</td>
            <td class="num">${fmtVND(r.price)}</td>
            <td>${fmtType(r.type)}</td>
            <td>${fmtSource(r.source)}</td>
            <td class="muted-sm">${escapeHtml(r.note || '')}</td>
            <td class="muted-sm">${fmtDatetime(r.recorded_at)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
}
