import { api } from '../api.js';
import { fmtVND, escapeHtml, openModal, closeModal, toast } from '../main.js';
import { enrichAsset } from '../data/groups.js';

const PAGE_SIZE = 50;
const DROPDOWN_LIMIT = 50;

export async function renderAssetDeltas(view) {
  // Include soft-deleted assets so their history can still be filtered.
  const rawAssets = await api.get('/assets?status=all');
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
        <select id="f-source" style="min-width:140px;">
          <option value="">Tất cả nguồn</option>
          <option value="manual">Thủ công</option>
          <option value="sync">Tích hợp</option>
          <option value="market">Thị trường</option>
        </select>
      </div>

      <div id="ph-list"></div>
      <div id="ph-pagination" class="pagination"></div>
    </div>
  `;

  let currentPage = 1;

  const load = async () => {
    const asset  = document.getElementById('f-asset-val').value;
    const type   = document.getElementById('f-type').value;
    const source = document.getElementById('f-source').value;
    const params = new URLSearchParams({ page: currentPage, limit: PAGE_SIZE });
    if (asset)  params.set('asset', asset);
    if (type)   params.set('type', type);
    if (source) params.set('source', source);

    document.getElementById('ph-list').innerHTML = '<div class="loading">Đang tải...</div>';
    const { rows, total } = await api.get('/asset-deltas?' + params.toString());
    document.getElementById('ph-list').innerHTML = renderTable(rows);
    bindUndoButtons(rows, load);
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
  document.getElementById('f-source').onchange = () => { currentPage = 1; load(); };

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
    html += shown.map((a) => {
      const deleted = a.status === 'deleted';
      const label = a.name + (deleted ? ' (đã xoá)' : '');
      return `
      <div class="bank-row" data-val="${a.id}" data-label="${escapeHtml(label)}">
        ${escapeHtml(a.group_icon)} ${escapeHtml(a.name)}${deleted ? ' <span class="muted-sm">(đã xoá)</span>' : ''}
      </div>
    `;
    }).join('');

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
  if (type === 'delete') return '<span class="badge neg">Xoá</span>';
  if (type === 'edit')   return '<span class="badge">Cập nhật</span>';
  return `<span class="badge">${escapeHtml(type || '')}</span>`;
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

const FIELD_LABELS = {
  name: 'Tên',
  qty: 'Số lượng',
  unit: 'Đơn vị',
  cost_price: 'Giá vốn',
  current_price: 'Giá hiện tại',
  member_id: 'Thành viên',
  platform: 'Nền tảng',
  bank: 'Ngân hàng',
  term: 'Kỳ hạn',
  maturity_date: 'Ngày đáo hạn',
  interest_rate: 'Lãi suất',
  interest_tax_rate: 'Thuế lãi',
  interest_payment_day: 'Ngày trả lãi',
  interest_payment_cycle: 'Chu kỳ trả lãi',
  interest_include_maturity: 'Lãi bao gồm ngày đáo hạn',
  start_date: 'Ngày bắt đầu',
  ticker: 'Mã',
  subtype: 'Phân loại',
  group_id: 'Nhóm',
  notes: 'Ghi chú',
};

const MONEY_FIELDS = new Set(['cost_price', 'current_price']);

function fmtVal(field, v) {
  if (v == null || v === '') return '—';
  if (MONEY_FIELDS.has(field)) return fmtVND(v);
  return escapeHtml(String(v));
}

// Render the JSON `changes` array as "Nhãn: cũ → mới" lines.
function fmtChanges(r) {
  if (!r.changes) return '<span class="muted-sm">—</span>';
  let list;
  try { list = JSON.parse(r.changes); } catch { return '<span class="muted-sm">—</span>'; }
  if (!Array.isArray(list) || !list.length) return '<span class="muted-sm">—</span>';

  return list.map((c) => {
    const label = FIELD_LABELS[c.field] || c.field;
    // create + delete store a full snapshot ({old:null, new:value}) → show the value only.
    if (r.type === 'create' || r.type === 'delete') {
      return `<div><strong>${escapeHtml(label)}</strong>: ${fmtVal(c.field, c.new)}</div>`;
    }
    return `<div><strong>${escapeHtml(label)}</strong>: <span class="muted-sm">${fmtVal(c.field, c.old)}</span> → ${fmtVal(c.field, c.new)}</div>`;
  }).join('');
}

// ────────────────────────────────────────────────────────────────────────────
// Undo
// ────────────────────────────────────────────────────────────────────────────

// Why an undo can't run right now, or null when it can.
function undoBlockedReason(r) {
  if (r.type === 'create' && r.asset_status === 'deleted') return 'Tài sản đã bị xoá';
  if (r.type === 'delete' && r.asset_status !== 'deleted') return 'Tài sản đang hoạt động';
  return null;
}

function undoButton(r) {
  const blocked = undoBlockedReason(r);
  return `<button class="small warn" data-act="undo" data-id="${r.id}"
    ${blocked ? `disabled title="${escapeHtml(blocked)}"` : 'title="Hoàn tác thay đổi này"'}>↩ Hoàn tác</button>`;
}

const UNDO_COPY = {
  create: {
    title: 'Hoàn tác tạo mới',
    confirm: 'Xoá tài sản',
    danger: true,
    body: (r) => `<p>Tài sản "<strong>${escapeHtml(r.asset_name)}</strong>" sẽ bị xoá.</p>`,
  },
  edit: {
    title: 'Hoàn tác cập nhật',
    confirm: 'Khôi phục',
    danger: false,
    body: (r) => `
      <p>Khôi phục "<strong>${escapeHtml(r.asset_name)}</strong>" về trạng thái trước thay đổi này:</p>
      <div class="muted-sm" style="margin-bottom:8px;">${revertPreview(r)}</div>`,
  },
  delete: {
    title: 'Hoàn tác xoá',
    confirm: 'Tạo lại',
    danger: false,
    body: (r) => `<p>Tài sản "<strong>${escapeHtml(r.asset_name)}</strong>" sẽ được tạo lại với thuộc tính tại thời điểm xoá.</p>`,
  },
};

// "Nhãn: giá trị hiện tại → giá trị sẽ khôi phục" for each field of an edit delta.
function revertPreview(r) {
  let list;
  try { list = JSON.parse(r.changes || '[]'); } catch { return ''; }
  if (!Array.isArray(list) || !list.length) return '';
  return list.map((c) => {
    const label = FIELD_LABELS[c.field] || c.field;
    return `<div><strong>${escapeHtml(label)}</strong>: ${fmtVal(c.field, c.new)} → ${fmtVal(c.field, c.old)}</div>`;
  }).join('');
}

function openUndoModal(r, reload) {
  const copy = UNDO_COPY[r.type];
  if (!copy) return;

  openModal(`
    <h3>${copy.title}</h3>
    ${copy.body(r)}
    <div class="form-grid">
      <label class="full">Ghi chú
        <textarea id="undo-notes" rows="2" placeholder="Lý do hoàn tác..."></textarea>
      </label>
    </div>
    <div class="modal-actions full">
      <button type="button" class="secondary" id="undo-cancel">Huỷ</button>
      <button type="button" class="${copy.danger ? 'danger' : ''}" id="undo-confirm">${copy.confirm}</button>
    </div>
  `, (root) => {
    root.querySelector('#undo-cancel').onclick = closeModal;
    root.querySelector('#undo-confirm').onclick = async () => {
      const btn = root.querySelector('#undo-confirm');
      btn.disabled = true;
      btn.classList.add('btn-loading');
      const notes = root.querySelector('#undo-notes').value.trim() || null;
      try {
        await api.post(`/asset-deltas/${r.id}/undo`, notes ? { notes } : {});
        toast('Đã hoàn tác');
        closeModal();
        await reload();
      } catch (err) {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
        toast('Lỗi: ' + err.message);
      }
    };
  });
}

function bindUndoButtons(rows, reload) {
  document.querySelectorAll('#ph-list [data-act="undo"]').forEach((btn) => {
    const row = rows.find((r) => r.id === Number(btn.dataset.id));
    if (row) btn.onclick = () => openUndoModal(row, reload);
  });
}

// ────────────────────────────────────────────────────────────────────────────

function renderTable(rows) {
  if (!rows.length) return '<div class="empty">Chưa có dữ liệu lịch sử nào</div>';
  return `
    <div class="table-wrap"><table>
      <thead>
        <tr>
          <th>Tài sản</th>
          <th>Thay đổi</th>
          <th>Loại</th>
          <th>Nguồn</th>
          <th>Ghi chú</th>
          <th>Thời gian</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${escapeHtml(r.asset_name)}</td>
            <td>${fmtChanges(r)}</td>
            <td>${fmtType(r.type)}</td>
            <td>${fmtSource(r.source)}</td>
            <td class="muted-sm">${escapeHtml(r.note || '')}</td>
            <td class="muted-sm">${fmtDatetime(r.recorded_at)}</td>
            <td>${undoButton(r)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
}
