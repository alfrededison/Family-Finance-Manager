import { api } from '../api.js';
import { fmtVND, escapeHtml, openModal, closeModal, toast, rerender } from '../main.js';

const TX_TYPES = [
  { value: 'buy', label: 'Mua' },
  { value: 'sell', label: 'Bán' },
  { value: 'dividend', label: 'Cổ tức' },
  { value: 'adjust', label: 'Điều chỉnh' },
  { value: 'transfer', label: 'Chuyển' },
];

export async function renderTransactions(view) {
  const [transactions, assets, members] = await Promise.all([
    api.get('/transactions'),
    api.get('/assets'),
    api.get('/members'),
  ]);

  view.innerHTML = `
    <div class="page-header">
      <h1>📝 Giao dịch</h1>
      <button id="btn-new">+ Thêm giao dịch</button>
    </div>

    <div class="section">
      <div class="toolbar">
        <input id="f-q" placeholder="Tìm kiếm..." style="flex:1; min-width:200px;" />
        <select id="f-member">
          <option value="">Tất cả thành viên</option>
          ${members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}
        </select>
      </div>

      <div id="tx-list">${renderTable(transactions)}</div>
    </div>
  `;

  document.getElementById('btn-new').onclick = () => openTxModal(assets, members);

  // PWA shortcut: /#/transactions?new=1 opens the new-transaction modal
  const query = window.location.hash.split('?')[1] || '';
  if (new URLSearchParams(query).get('new') === '1') {
    history.replaceState(null, '', '#/transactions');
    openTxModal(assets, members);
  }

  let filterTimer;
  const reload = async () => {
    const q = document.getElementById('f-q').value;
    const member = document.getElementById('f-member').value;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (member) params.set('member', member);
    const filtered = await api.get('/transactions?' + params.toString());
    document.getElementById('tx-list').innerHTML = renderTable(filtered);
  };
  document.getElementById('f-q').oninput = () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(reload, 200);
  };
  document.getElementById('f-member').onchange = reload;
}

function renderTable(txs) {
  if (!txs.length) return '<div class="empty">Chưa có giao dịch nào</div>';
  return `
    <div class="table-wrap"><table>
      <thead>
        <tr>
          <th>Ngày</th>
          <th>Loại</th>
          <th>Tài sản</th>
          <th>Thành viên</th>
          <th class="num">Số lượng</th>
          <th class="num">Đơn giá</th>
          <th class="num">Tổng</th>
          <th>Ghi chú</th>
        </tr>
      </thead>
      <tbody>
        ${txs.map((t) => `
          <tr>
            <td>${escapeHtml(t.date)}</td>
            <td><span class="badge">${escapeHtml(typeLabel(t.type))}</span></td>
            <td>${escapeHtml(t.asset_name)}</td>
            <td>${escapeHtml(t.member_name || '—')}</td>
            <td class="num">${t.qty}</td>
            <td class="num">${fmtVND(t.unit_price)}</td>
            <td class="num"><strong>${fmtVND(t.total)}</strong></td>
            <td>${escapeHtml(t.notes || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
}

function typeLabel(t) {
  const f = TX_TYPES.find((x) => x.value === t);
  return f ? f.label : t;
}

function openTxModal(assets, members) {
  const today = new Date().toISOString().slice(0, 10);
  openModal(`
    <h3>Thêm giao dịch</h3>
    <form id="tx-form" class="form-grid">
      <label>Ngày
        <input name="date" type="date" required value="${today}" />
      </label>
      <label>Loại
        <select name="type" required>
          ${TX_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
        </select>
      </label>
      <label>Tài sản
        <select name="asset_id" required>
          <option value="">— Chọn —</option>
          ${assets.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}
        </select>
      </label>
      <label>Thành viên
        <select name="member_id">
          <option value="">— Không —</option>
          ${members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}
        </select>
      </label>
      <label>Số lượng
        <input name="qty" type="number" step="any" value="0" />
      </label>
      <label>Đơn giá
        <input name="unit_price" type="number" step="any" value="0" />
      </label>
      <label class="full">Tổng (để trống = qty × đơn giá)
        <input name="total" type="number" step="any" />
      </label>
      <label class="full">Ghi chú
        <textarea name="notes" rows="2"></textarea>
      </label>
      <div class="modal-actions full">
        <button type="button" class="secondary" id="cancel">Huỷ</button>
        <button type="submit">Tạo</button>
      </div>
    </form>
  `, (root) => {
    root.querySelector('#cancel').onclick = closeModal;
    root.querySelector('#tx-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {};
      for (const [k, v] of fd.entries()) body[k] = v === '' ? null : v;
      try {
        await api.post('/transactions', body);
        toast('Đã thêm giao dịch');
        closeModal();
        rerender();
      } catch (err) {
        toast('Lỗi: ' + err.message);
      }
    };
  });
}
