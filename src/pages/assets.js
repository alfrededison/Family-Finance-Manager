import { api } from '../api.js';
import { fmtVND, fmtPct, escapeHtml, openModal, closeModal, toast, rerender } from '../main.js';

export async function renderAssets(view) {
  const [assets, groups, members] = await Promise.all([
    api.get('/assets'),
    api.get('/groups'),
    api.get('/members'),
  ]);

  view.innerHTML = `
    <div class="page-header">
      <h1>💼 Tài sản</h1>
      <button id="btn-new">+ Thêm tài sản</button>
    </div>

    <div class="section">
      <div class="toolbar">
        <input id="f-q" placeholder="Tìm kiếm theo tên..." style="flex:1; min-width:200px;" />
        <select id="f-group">
          <option value="">Tất cả nhóm</option>
          ${groups.map((g) => `<option value="${g.id}">${escapeHtml(g.icon)} ${escapeHtml(g.name)}</option>`).join('')}
        </select>
        <select id="f-member">
          <option value="">Tất cả thành viên</option>
          ${members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}
        </select>
      </div>

      <div id="asset-list">${renderTable(assets, members)}</div>
    </div>
  `;

  document.getElementById('btn-new').onclick = () => openAssetModal(null, groups, members);

  let filterTimer;
  const reload = async () => {
    const q = document.getElementById('f-q').value;
    const group = document.getElementById('f-group').value;
    const member = document.getElementById('f-member').value;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (group) params.set('group', group);
    if (member) params.set('member', member);
    const filtered = await api.get('/assets?' + params.toString());
    document.getElementById('asset-list').innerHTML = renderTable(filtered, members);
    bindRowActions(filtered, groups, members);
  };
  document.getElementById('f-q').oninput = () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(reload, 200);
  };
  document.getElementById('f-group').onchange = reload;
  document.getElementById('f-member').onchange = reload;

  bindRowActions(assets, groups, members);
}

function renderTable(assets, members) {
  if (!assets.length) return '<div class="empty">Chưa có tài sản nào</div>';
  return `
    <div class="table-wrap"><table>
      <thead>
        <tr>
          <th>Tên</th>
          <th>Nhóm</th>
          <th>Thành viên</th>
          <th class="num">SL</th>
          <th class="num">Giá vốn</th>
          <th class="num">Giá hiện tại</th>
          <th class="num">Giá trị</th>
          <th class="num">Lãi/Lỗ</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${assets.map((a) => `
          <tr data-id="${a.id}">
            <td><strong>${escapeHtml(a.name)}</strong>${a.notes ? `<div style="color:var(--muted); font-size:11px;">${escapeHtml(a.notes)}</div>` : ''}</td>
            <td>${escapeHtml(a.group_icon)} ${escapeHtml(a.group_name)}</td>
            <td>${a.member_id ? `<span class="member-chip" style="background:${escapeHtml(a.member_color)}">${escapeHtml(a.member_name)}</span>` : '—'}</td>
            <td class="num">${a.qty} ${escapeHtml(a.unit || '')}</td>
            <td class="num">${fmtVND(a.cost_price)}</td>
            <td class="num">${fmtVND(a.current_price)}</td>
            <td class="num"><strong>${fmtVND(a.value)}</strong></td>
            <td class="num ${a.pnl >= 0 ? 'pos' : 'neg'}">
              ${fmtVND(a.pnl)}<br/><small>${fmtPct(a.pnlPct)}</small>
            </td>
            <td>
              <button class="small secondary" data-act="edit">Sửa</button>
              <button class="small danger" data-act="del">Xoá</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
}

function bindRowActions(assets, groups, members) {
  document.querySelectorAll('#asset-list tr[data-id]').forEach((tr) => {
    const id = Number(tr.dataset.id);
    const asset = assets.find((a) => a.id === id);
    tr.querySelector('[data-act="edit"]').onclick = () => openAssetModal(asset, groups, members);
    tr.querySelector('[data-act="del"]').onclick = async () => {
      if (!confirm(`Xoá tài sản "${asset.name}"?`)) return;
      try {
        await api.del('/assets/' + id);
        toast('Đã xoá');
        rerender();
      } catch (err) {
        toast('Lỗi: ' + err.message);
      }
    };
  });
}

function openAssetModal(asset, groups, members) {
  const editing = !!asset;
  const a = asset || {};
  openModal(`
    <h3>${editing ? 'Sửa tài sản' : 'Thêm tài sản'}</h3>
    <form id="asset-form" class="form-grid">
      <label class="full">Tên
        <input name="name" required value="${escapeHtml(a.name || '')}" />
      </label>
      <label>Nhóm
        <select name="group_id" required>
          <option value="">— Chọn —</option>
          ${groups.map((g) => `<option value="${g.id}" ${a.group_id === g.id ? 'selected' : ''}>${escapeHtml(g.icon)} ${escapeHtml(g.name)}</option>`).join('')}
        </select>
      </label>
      <label>Thành viên
        <select name="member_id">
          <option value="">— Không —</option>
          ${members.map((m) => `<option value="${m.id}" ${a.member_id === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
        </select>
      </label>
      <label>Phân loại
        <input name="subtype" value="${escapeHtml(a.subtype || '')}" />
      </label>
      <label>Đơn vị
        <input name="unit" value="${escapeHtml(a.unit || '')}" placeholder="VD: cp, BTC, chỉ" />
      </label>
      <label>Số lượng
        <input name="qty" type="number" step="any" value="${a.qty ?? 0}" />
      </label>
      <label>Giá vốn
        <input name="cost_price" type="number" step="any" value="${a.cost_price ?? 0}" />
      </label>
      <label>Giá hiện tại
        <input name="current_price" type="number" step="any" value="${a.current_price ?? 0}" />
      </label>
      <label>Ngày bắt đầu
        <input name="start_date" type="date" value="${escapeHtml(a.start_date || '')}" />
      </label>
      <label>Ngày kết thúc
        <input name="end_date" type="date" value="${escapeHtml(a.end_date || '')}" />
      </label>
      <label>Lãi suất (%)
        <input name="rate" type="number" step="any" value="${a.rate ?? ''}" />
      </label>
      <label class="full">Ghi chú
        <textarea name="notes" rows="2">${escapeHtml(a.notes || '')}</textarea>
      </label>
      <div class="modal-actions full">
        <button type="button" class="secondary" id="cancel">Huỷ</button>
        <button type="submit">${editing ? 'Cập nhật' : 'Tạo'}</button>
      </div>
    </form>
  `, (root) => {
    root.querySelector('#cancel').onclick = closeModal;
    root.querySelector('#asset-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {};
      for (const [k, v] of fd.entries()) body[k] = v === '' ? null : v;
      try {
        if (editing) await api.put('/assets/' + asset.id, body);
        else await api.post('/assets', body);
        toast(editing ? 'Đã cập nhật' : 'Đã thêm');
        closeModal();
        rerender();
      } catch (err) {
        toast('Lỗi: ' + err.message);
      }
    };
  });
}
