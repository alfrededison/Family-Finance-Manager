import { api } from '../api.js';
import { fmtVND, escapeHtml } from '../main.js';
import { enrichAsset, ASSET_GROUPS } from '../data/groups.js';

const PAGE_SIZE = 50;

export async function renderPriceHistory(view) {
  const rawAssets = await api.get('/assets');
  const assets = rawAssets.map(enrichAsset);

  view.innerHTML = `
    <div class="page-header">
      <h1>📈 Lịch sử giá</h1>
    </div>

    <div class="section">
      <div class="toolbar">
        <select id="f-asset" style="flex:1; min-width:200px;">
          <option value="">Tất cả tài sản</option>
          ${assets.map((a) => `<option value="${a.id}">${escapeHtml(a.group_icon)} ${escapeHtml(a.name)}</option>`).join('')}
        </select>
      </div>

      <div id="ph-list"></div>
      <div id="ph-pagination" class="pagination"></div>
    </div>
  `;

  let currentPage = 1;

  const load = async () => {
    const asset = document.getElementById('f-asset').value;
    const params = new URLSearchParams({ page: currentPage, limit: PAGE_SIZE });
    if (asset) params.set('asset', asset);

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

  document.getElementById('f-asset').onchange = () => { currentPage = 1; load(); };

  load();
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
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function renderTable(rows) {
  if (!rows.length) return '<div class="empty">Chưa có dữ liệu giá nào</div>';
  return `
    <div class="table-wrap"><table>
      <thead>
        <tr>
          <th>Tài sản</th>
          <th class="num">Giá</th>
          <th>Nguồn</th>
          <th>Thời gian</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${escapeHtml(r.asset_name)}</td>
            <td class="num">${fmtVND(r.price)}</td>
            <td>${fmtSource(r.source)}</td>
            <td class="muted-sm">${fmtDatetime(r.recorded_at)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
}
