import { api } from '../api.js';
import { fmtVND, escapeHtml, openModal, closeModal, toast, rerender, bindMoneyInputs, parseMoneyPayload, parseMoney, formatMoney } from '../main.js';
import { ASSET_GROUPS, enrichAsset } from '../data/groups.js';

// Transaction fields holding VND amounts — formatted on input, parsed on submit.
const TX_MONEY_FIELDS = ['unit_price', 'fee', 'tax', 'total', 'gross_interest'];

// Canonical transaction-type table. `groups` says which asset groups offer
// this type in their modal. `direction` is informational (used for the badge
// colour). All flows store positive numbers — the type implies the sign.
export const TX_TYPES = [
  // Đầu tư & Tích trữ
  { value: 'buy',                label: 'Mua',           groups: ['dau-tu', 'tich-tru'], direction: 'out' },
  { value: 'sell',               label: 'Bán',           groups: ['dau-tu', 'tich-tru'], direction: 'in'  },
  // Cho vay
  { value: 'lend_more',          label: 'Cho vay thêm',  groups: ['cho-vay'],            direction: 'out' },
  { value: 'collect_principal',  label: 'Thu vốn',       groups: ['cho-vay'],            direction: 'in'  },
  { value: 'collect_interest',   label: 'Thu lãi',       groups: ['cho-vay'],            direction: 'in'  },
  { value: 'settle_out',         label: 'Tất toán',      groups: ['cho-vay'],            direction: 'in'  },
  // Đi vay
  { value: 'borrow_more',        label: 'Vay thêm',      groups: ['di-vay'],             direction: 'in'  },
  { value: 'pay_principal',      label: 'Trả vốn',       groups: ['di-vay'],             direction: 'out' },
  { value: 'pay_interest',       label: 'Trả lãi',       groups: ['di-vay'],             direction: 'out' },
  { value: 'settle_in',          label: 'Tất toán',      groups: ['di-vay'],             direction: 'out' },
  // Tiền gửi, Bank
  { value: 'deposit',            label: 'Nạp / Gửi',     groups: ['tien-gui', 'bank'],   direction: 'out' },
  { value: 'withdraw',           label: 'Rút',           groups: ['tien-gui', 'bank'],   direction: 'in'  },
  { value: 'interest_in',        label: 'Nhận lãi',      groups: ['tien-gui', 'bank'],   direction: 'in'  },
  { value: 'adjust',             label: 'Điều chỉnh',    groups: ['*'],                  direction: 'neutral' },
  { value: 'transfer',           label: 'Chuyển',        groups: ['*'],                  direction: 'neutral' },
];

const TYPE_BY_VALUE = Object.fromEntries(TX_TYPES.map((t) => [t.value, t]));

export function txTypeLabel(value) {
  return TYPE_BY_VALUE[value]?.label || value;
}

function typesForGroup(groupId) {
  return TX_TYPES.filter((t) => t.groups.includes(groupId) || t.groups.includes('*'));
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export async function renderTransactions(view) {
  const [transactions, rawAssets, members] = await Promise.all([
    api.get('/transactions'),
    api.get('/assets'),
    api.get('/members'),
  ]);
  const assets = rawAssets.map(enrichAsset);

  view.innerHTML = `
    <div class="page-header">
      <h1>📝 Giao dịch</h1>
      <button id="btn-new">+ Thêm giao dịch</button>
    </div>

    <div class="section">
      <div class="toolbar">
        <input id="f-q" placeholder="Tìm kiếm..." style="flex:1; min-width:200px;" />
        <select id="f-group">
          <option value="">Tất cả nhóm</option>
          ${ASSET_GROUPS.map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.icon)} ${escapeHtml(g.name)}</option>`).join('')}
        </select>
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
    const group = document.getElementById('f-group').value;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (member) params.set('member', member);
    if (group) params.set('group', group);
    const filtered = await api.get('/transactions?' + params.toString());
    document.getElementById('tx-list').innerHTML = renderTable(filtered);
  };
  document.getElementById('f-q').oninput = () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(reload, 200);
  };
  document.getElementById('f-member').onchange = reload;
  document.getElementById('f-group').onchange = reload;
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
          <th class="num">Phí / Thuế</th>
          <th class="num">Tổng</th>
          <th>Ghi chú</th>
        </tr>
      </thead>
      <tbody>
        ${txs.map((t) => {
          const meta = TYPE_BY_VALUE[t.type];
          const cls = meta?.direction === 'in' ? 'pos' : meta?.direction === 'out' ? 'neg' : '';
          return `
            <tr>
              <td>${escapeHtml(t.date)}</td>
              <td><span class="badge ${cls}">${escapeHtml(txTypeLabel(t.type))}</span></td>
              <td>${escapeHtml(t.asset_name)}</td>
              <td>${escapeHtml(t.member_name || '—')}</td>
              <td class="num">${t.qty || ''}</td>
              <td class="num">${t.unit_price ? fmtVND(t.unit_price) : ''}</td>
              <td class="num">${(t.fee || t.tax) ? fmtVND((t.fee || 0) + (t.tax || 0)) : ''}</td>
              <td class="num"><strong>${fmtVND(t.total)}</strong></td>
              <td>${escapeHtml(t.notes || '')}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table></div>
  `;
}

// ────────────────────────────────────────────────────────────────────────────
// Modal — group selector → asset filtered to that group → type-specific fields
// ────────────────────────────────────────────────────────────────────────────

function openTxModal(allAssets, members) {
  const today = new Date().toISOString().slice(0, 10);
  const initialGroup = ASSET_GROUPS[0]?.id || '';

  openModal(`
    <h3>Thêm giao dịch</h3>
    <div class="form-grid" style="margin-bottom: 8px;">
      <label class="full">Nhóm tài sản
        <select id="t-group">
          ${ASSET_GROUPS.map((g) => `<option value="${escapeHtml(g.id)}" ${g.id === initialGroup ? 'selected' : ''}>${escapeHtml(g.icon)} ${escapeHtml(g.name)}</option>`).join('')}
        </select>
      </label>
    </div>
    <div id="tx-body"></div>
  `, (root) => {
    const groupSelect = root.querySelector('#t-group');
    const body = root.querySelector('#tx-body');

    const mount = (groupId) => {
      const assetsInGroup = allAssets.filter((a) => a.group_id === groupId);
      const types = typesForGroup(groupId);
      const state = { date: today, type: types[0]?.value, asset_id: '', member_id: '', notes: '' };

      const render = () => {
        body.innerHTML = renderTxForm(groupId, types, assetsInGroup, members, state);
        bindMoneyInputs(body);
        bindTxBehaviour(groupId, body, state, assetsInGroup, () => {
          capture(body, state);
          render();
        });
        bindTxSubmit(body, state);
      };
      render();
    };

    groupSelect.addEventListener('change', () => mount(groupSelect.value));
    mount(initialGroup);
  });
}

// Captures current values from the live form back into state so we can
// preserve them across a re-render triggered by type/asset change.
function capture(body, state) {
  const get = (sel) => body.querySelector(sel)?.value ?? '';
  state.date      = get('input[name="date"]');
  state.type      = get('select[name="type"]');
  state.asset_id  = get('select[name="asset_id"]');
  state.member_id = get('select[name="member_id"]');
  state.notes     = get('textarea[name="notes"]');
}

// Renders the per-group transaction form. Amount section is chosen by
// `renderAmountSection` based on group + selected type.
function renderTxForm(groupId, types, assetsInGroup, members, state) {
  const selectedAsset = assetsInGroup.find((a) => String(a.id) === String(state.asset_id));
  return `
    <form id="tx-form" class="form-grid">
      <label>Ngày
        <input name="date" type="date" required value="${escapeHtml(state.date)}" />
      </label>
      <label>Loại
        <select name="type" required>
          ${types.map((t) => `<option value="${t.value}" ${t.value === state.type ? 'selected' : ''}>${escapeHtml(t.label)}</option>`).join('')}
        </select>
      </label>
      <label class="full">Tài sản
        <select name="asset_id" required>
          <option value="">— Chọn —</option>
          ${assetsInGroup.map((a) => `<option value="${a.id}" ${String(a.id) === String(state.asset_id) ? 'selected' : ''}>${escapeHtml(a.name)}${a.subtype_name ? ' · ' + escapeHtml(a.subtype_name) : ''}</option>`).join('')}
        </select>
      </label>
      <label>Thành viên
        <select name="member_id">
          <option value="">— Không —</option>
          ${members.map((m) => `<option value="${m.id}" ${String(m.id) === String(state.member_id) ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
        </select>
      </label>

      ${renderAmountSection(groupId, state.type, selectedAsset)}

      <label class="full">Ghi chú
        <textarea name="notes" rows="2">${escapeHtml(state.notes)}</textarea>
      </label>
      <div class="modal-actions full">
        <button type="button" class="secondary" id="cancel">Huỷ</button>
        <button type="submit">Tạo</button>
      </div>
    </form>
  `;
}

// Three amount-section variants, picked by (groupId, type):
//   - buy/sell (đầu tư, tích trữ): SL × đơn giá ± phí/thuế
//   - Tiền gửi nhận lãi:           Lãi gộp − thuế = lãi ròng
//   - everything else:             single Số tiền field
function renderAmountSection(groupId, type, selectedAsset) {
  if (['dau-tu', 'tich-tru'].includes(groupId)) {
    return `
      <label>Số lượng
        <input name="qty" type="number" step="any" value="0" />
      </label>
      <label>Đơn giá
        <input name="unit_price" type="text" inputmode="numeric" data-money value="0" />
      </label>
      <label>Phí
        <input name="fee" type="text" inputmode="numeric" data-money value="0" />
      </label>
      <label>Thuế
        <input name="tax" type="text" inputmode="numeric" data-money value="0" />
      </label>
      <label class="full">Tổng
        <input name="total" type="text" inputmode="numeric" data-money placeholder="Tự tính từ SL × đơn giá ± phí/thuế" />
      </label>
    `;
  }
  if (groupId === 'tien-gui' && type === 'interest_in') {
    const defaultTaxRate = selectedAsset?.interest_tax_rate ?? 5;
    return `
      <label>Lãi gộp
        <input name="gross_interest" type="text" inputmode="numeric" data-money required value="0" />
      </label>
      <label>Thuế (%)
        <input name="tax_rate" type="number" step="any" value="${defaultTaxRate}" />
      </label>
      <label>Thuế (VND)
        <input name="tax" type="text" inputmode="numeric" data-money readonly />
      </label>
      <label>Lãi ròng nhận về
        <input name="total" type="text" inputmode="numeric" data-money readonly required />
      </label>
      <input type="hidden" name="qty" value="0" />
      <input type="hidden" name="unit_price" value="0" />
    `;
  }
  return `
    <label class="full">Số tiền
      <input name="total" type="text" inputmode="numeric" data-money required value="0" />
    </label>
    <input type="hidden" name="qty" value="0" />
    <input type="hidden" name="unit_price" value="0" />
  `;
}

// Wire dynamic behaviour: re-render on type/asset change, plus per-form
// auto-calc (buy/sell totals and interest net).
function bindTxBehaviour(groupId, body, state, assetsInGroup, rerenderForm) {
  // Re-render the form body when type changes (different amount section).
  body.querySelector('select[name="type"]').addEventListener('change', rerenderForm);

  // Re-render when asset changes if we're on tien-gui interest_in so the
  // tax-rate default updates from the newly-selected asset.
  if (groupId === 'tien-gui' && state.type === 'interest_in') {
    body.querySelector('select[name="asset_id"]').addEventListener('change', rerenderForm);
    bindInterestCalc(body);
    return;
  }

  if (['dau-tu', 'tich-tru'].includes(groupId)) {
    bindBuySellCalc(body);
  }
}

function bindBuySellCalc(body) {
  const qtyEl   = body.querySelector('input[name="qty"]');
  const priceEl = body.querySelector('input[name="unit_price"]');
  const feeEl   = body.querySelector('input[name="fee"]');
  const taxEl   = body.querySelector('input[name="tax"]');
  const totalEl = body.querySelector('input[name="total"]');
  const typeEl  = body.querySelector('select[name="type"]');
  if (!qtyEl || !priceEl || !totalEl) return;

  let userEdited = false;
  totalEl.addEventListener('input', () => { userEdited = true; });

  const recalc = () => {
    if (userEdited) return;
    const qty   = Number(qtyEl.value || 0);
    const price = parseMoney(priceEl.value) || 0;
    const fee   = parseMoney(feeEl?.value)  || 0;
    const tax   = parseMoney(taxEl?.value)  || 0;
    const sign  = typeEl?.value === 'sell' ? -1 : 1;
    totalEl.value = formatMoney(qty * price + sign * (fee + tax));
  };
  [qtyEl, priceEl, feeEl, taxEl, typeEl].forEach((el) => el && el.addEventListener('input', recalc));
}

// Tiền gửi · Nhận lãi: tax = gross × rate%, net = gross − tax.
function bindInterestCalc(body) {
  const grossEl = body.querySelector('input[name="gross_interest"]');
  const rateEl  = body.querySelector('input[name="tax_rate"]');
  const taxEl   = body.querySelector('input[name="tax"]');
  const netEl   = body.querySelector('input[name="total"]');
  if (!grossEl || !rateEl || !taxEl || !netEl) return;

  const recalc = () => {
    const gross = parseMoney(grossEl.value) || 0;
    const rate  = Number(rateEl.value || 0);
    const tax   = Math.round(gross * rate / 100);
    const net   = gross - tax;
    taxEl.value = formatMoney(tax);
    netEl.value = formatMoney(net);
  };
  grossEl.addEventListener('input', recalc);
  rateEl.addEventListener('input', recalc);
  recalc();
}

function bindTxSubmit(body) {
  const form = body.querySelector('#tx-form');
  body.querySelector('#cancel').onclick = closeModal;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {};
    for (const [k, v] of fd.entries()) payload[k] = v === '' ? null : v;
    parseMoneyPayload(payload, TX_MONEY_FIELDS);

    // Tiền gửi · Nhận lãi: stash gross interest in unit_price for traceability,
    // drop the helper-only fields before posting.
    if (payload.gross_interest != null) {
      payload.unit_price = payload.gross_interest;
      delete payload.gross_interest;
      delete payload.tax_rate;
    }

    try {
      await api.post('/transactions', payload);
      toast('Đã thêm giao dịch');
      closeModal();
      rerender();
    } catch (err) {
      toast('Lỗi: ' + err.message);
    }
  };
}
