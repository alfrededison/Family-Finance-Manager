import { api } from '../api.js';
import { fmtVND, fmtPct, escapeHtml, openModal, closeModal, toast, rerender, bindMoneyInputs, parseMoneyPayload } from '../main.js';
import { bankSelectHTML, bindBankSelect } from '../components/bank-select.js';
import { platformSelectHTML } from '../components/platform-select.js';
import { formatBank } from '../data/banks.js';

// Asset fields that hold VND amounts — tagged with data-money so they get
// auto-formatted on input and parsed back to plain integers on submit.
const MONEY_FIELDS = ['cost_price', 'current_price'];

const BANK_SAVINGS_SUBTYPES = ['Tiết kiệm dài tháng', 'Tiết kiệm ít tháng'];

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
          ${groups.map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.icon)} ${escapeHtml(g.name)}</option>`).join('')}
        </select>
        <select id="f-member">
          <option value="">Tất cả thành viên</option>
          ${members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}
        </select>
      </div>

      <div id="asset-list">${renderTable(assets)}</div>
    </div>
  `;

  document.getElementById('btn-new').onclick = () => openAssetModal(null, groups, members);

  // PWA shortcut: /#/assets?new=1 opens the new-asset modal
  const query = window.location.hash.split('?')[1] || '';
  if (new URLSearchParams(query).get('new') === '1') {
    history.replaceState(null, '', '#/assets');
    openAssetModal(null, groups, members);
  }

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
    document.getElementById('asset-list').innerHTML = renderTable(filtered);
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

function renderTable(assets) {
  if (!assets.length) return '<div class="empty">Chưa có tài sản nào</div>';
  return `
    <div class="table-wrap"><table>
      <thead>
        <tr>
          <th>Tên</th>
          <th>Nhóm / Loại</th>
          <th>Thành viên</th>
          <th class="num">SL / Đơn vị</th>
          <th class="num">Giá trị</th>
          <th class="num">Lãi/Lỗ</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${assets.map((a) => `
          <tr data-id="${a.id}">
            <td>
              <strong>${escapeHtml(a.name)}</strong>
              ${subInfoLine(a)}
            </td>
            <td>
              ${escapeHtml(a.group_icon)} ${escapeHtml(a.group_name)}
              ${a.subtype ? `<div class="muted-sm">${escapeHtml(a.subtype)}</div>` : ''}
            </td>
            <td>${a.member_id ? `<span class="member-chip" style="background:${escapeHtml(a.member_color)}">${escapeHtml(a.member_name)}</span>` : '—'}</td>
            <td class="num">${a.qty || 0} ${escapeHtml(a.unit || '')}</td>
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

function subInfoLine(a) {
  const bits = [];
  if (a.group_id === 'bank' && a.bank) bits.push(formatBank(a.bank));
  if (a.group_id === 'tien-gui' && a.platform) bits.push(a.platform);
  if (a.maturity_date) bits.push('Đáo hạn: ' + a.maturity_date);
  if (a.interest_rate != null && a.interest_rate !== '') bits.push(a.interest_rate + '%');
  if (a.notes) bits.push(a.notes);
  if (!bits.length) return '';
  return `<div class="muted-sm">${bits.map(escapeHtml).join(' · ')}</div>`;
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

// ────────────────────────────────────────────────────────────────────────────
// Modal — group selector swaps the entire form body
// ────────────────────────────────────────────────────────────────────────────

async function openAssetModal(asset, groups, members) {
  const editing = !!asset;
  const initialGroup = asset?.group_id || groups[0]?.id || '';

  openModal(`
    <h3>${editing ? 'Sửa tài sản' : 'Thêm tài sản'}</h3>
    <div class="form-grid" style="margin-bottom: 8px;">
      <label class="full">Nhóm
        <select id="a-group" ${editing ? 'disabled' : ''}>
          ${groups.map((g) => `<option value="${escapeHtml(g.id)}" ${g.id === initialGroup ? 'selected' : ''}>${escapeHtml(g.icon)} ${escapeHtml(g.name)}</option>`).join('')}
        </select>
      </label>
    </div>
    <div id="form-body"></div>
  `, async (root) => {
    const groupSelect = root.querySelector('#a-group');
    const formBody = root.querySelector('#form-body');

    const mount = async (groupId) => {
      formBody.innerHTML = '<div class="loading">Đang tải...</div>';
      const group = groups.find((g) => g.id === groupId) || groups[0];
      const subtypes = group?.subtypes || [];
      const platforms = groupId === 'tien-gui' ? await api.get('/platforms') : [];
      formBody.innerHTML = renderGroupForm(groupId, subtypes, platforms, members, asset);
      bindBankSelect(formBody);
      bindMoneyInputs(formBody);
      bindFormBehaviour(groupId, formBody);
      bindSubmit(groupId, formBody, asset, editing);
    };

    groupSelect.addEventListener('change', () => mount(groupSelect.value));
    await mount(initialGroup);
  });
}

// Picks the right renderer by group id (slug). Unknown groups fall back to a
// generic form so user-created groups still work.
function renderGroupForm(groupId, subtypes, platforms, members, asset) {
  switch (groupId) {
    case 'dau-tu':   return formDauTu(subtypes, members, asset);
    case 'tich-tru': return formTichTru(subtypes, members, asset);
    case 'cho-vay':  return formChoVay(subtypes, members, asset);
    case 'di-vay':   return formDiVay(subtypes, members, asset);
    case 'tien-gui': return formTienGui(subtypes, platforms, members, asset);
    case 'bank':     return formBank(subtypes, members, asset);
    default:         return formGeneric(subtypes, members, asset);
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
        ${subtypes.map((s) => `<option value="${escapeHtml(s.name)}" ${asset?.subtype === s.name ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
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
// Stored as qty=1, cost_price = principal lent. current_price = total owed (principal + accrued).
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
      <input name="end_date" type="date" value="${escapeHtml(a.end_date || '')}" />
    </label>
    <input type="hidden" name="qty" value="1" />
    <input type="hidden" name="unit" value="VND" />
    ${fragNotes(a)}
    ${fragActions(!!asset)}
  </form>`;
}

// ─── Đi vay ────────────────────────────────────────────────────────────────
// Stored as qty=1, cost_price = original principal, current_price = remaining balance (current liability).
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
      <input name="end_date" type="date" value="${escapeHtml(a.end_date || '')}" />
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
    <label data-bank-savings>Lãi suất (%/năm)
      <input name="interest_rate" type="number" step="any" value="${a.interest_rate ?? ''}" />
    </label>
    <label data-bank-savings>Ngày gửi
      <input name="start_date" type="date" value="${escapeHtml(a.start_date || '')}" />
    </label>
    <label data-bank-savings class="full">Ngày đáo hạn
      <input name="maturity_date" type="date" value="${escapeHtml(a.maturity_date || '')}" />
    </label>
    <input type="hidden" name="qty" value="1" />
    <input type="hidden" name="cost_price" value="${a.cost_price ?? 0}" />
    <input type="hidden" name="unit" value="VND" />
    ${fragActions(!!asset)}
  </form>`;
}

// ─── Generic fallback (for user-created groups) ────────────────────────────
function formGeneric(subtypes, members, asset) {
  const a = asset || {};
  return `<form id="asset-form" class="form-grid">
    <label class="full">Tên
      <input name="name" required value="${escapeHtml(a.name || '')}" />
    </label>
    ${fragSubtype(subtypes, a)}
    ${fragMember(members, a)}
    <label>Số lượng
      <input name="qty" type="number" step="any" value="${a.qty ?? 0}" />
    </label>
    <label>Đơn vị
      <input name="unit" value="${escapeHtml(a.unit || '')}" />
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

// ────────────────────────────────────────────────────────────────────────────
// Form behaviour (Bank: show savings fields only for term-savings subtypes)
// ────────────────────────────────────────────────────────────────────────────
function bindFormBehaviour(groupId, formBody) {
  if (groupId !== 'bank') return;
  const subtypeEl = formBody.querySelector('select[name="subtype"]');
  const savingsEls = formBody.querySelectorAll('[data-bank-savings]');
  if (!subtypeEl || !savingsEls.length) return;

  const toggle = () => {
    const show = BANK_SAVINGS_SUBTYPES.includes(subtypeEl.value);
    savingsEls.forEach((el) => { el.style.display = show ? '' : 'none'; });
  };
  subtypeEl.addEventListener('change', toggle);
  toggle();
}

// ────────────────────────────────────────────────────────────────────────────
// Submit handler — collects form data, posts to API
// ────────────────────────────────────────────────────────────────────────────
function bindSubmit(groupId, formBody, asset, editing) {
  const form = formBody.querySelector('#asset-form');
  const cancelBtn = formBody.querySelector('#cancel');
  cancelBtn.onclick = closeModal;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = { group_id: groupId };
    for (const [k, v] of fd.entries()) body[k] = v === '' ? null : v;
    parseMoneyPayload(body, MONEY_FIELDS);

    if (groupId === 'tien-gui') {
      body.current_price = body.cost_price;
    }
    if (groupId === 'bank' && !BANK_SAVINGS_SUBTYPES.includes(body.subtype)) {
      body.interest_rate = null;
      body.start_date = null;
      body.maturity_date = null;
    }

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
}
