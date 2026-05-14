import { api } from '../api.js';
import { fmtVND, fmtPct, escapeHtml, openModal, closeModal, toast, rerender, bindMoneyInputs, parseMoneyPayload } from '../main.js';
import { bankSelectHTML, bindBankSelect } from '../components/bank-select.js';
import { platformSelectHTML } from '../components/platform-select.js';
import { formatBank } from '../data/banks.js';
import { ASSET_GROUPS, findGroup, enrichAsset } from '../data/groups.js';

// Asset fields that hold VND amounts — tagged with data-money so they get
// auto-formatted on input and parsed back to plain integers on submit.
const MONEY_FIELDS = ['cost_price', 'current_price'];

const BANK_SAVINGS_SUBTYPES = ['tk-dai-thang', 'tk-it-thang'];

export async function renderAssets(view) {
  const [rawAssets, members] = await Promise.all([
    api.get('/assets'),
    api.get('/members'),
  ]);
  const assets = rawAssets.map(enrichAsset);

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
          ${ASSET_GROUPS.map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.icon)} ${escapeHtml(g.name)}</option>`).join('')}
        </select>
        <select id="f-member">
          <option value="">Tất cả thành viên</option>
          ${members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}
        </select>
      </div>

      <div id="asset-list">${renderTable(assets)}</div>
    </div>
  `;

  let filterTimer;
  let currentAssets = assets;
  const reload = async () => {
    const q = document.getElementById('f-q').value;
    const group = document.getElementById('f-group').value;
    const member = document.getElementById('f-member').value;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (group) params.set('group', group);
    if (member) params.set('member', member);
    const filtered = (await api.get('/assets?' + params.toString())).map(enrichAsset);
    currentAssets = filtered;
    document.getElementById('asset-list').innerHTML = renderTable(filtered);
    bindRowActions(filtered, members, reload);
  };

  document.getElementById('btn-new').onclick = () => openAssetModal(null, members, reload);

  // PWA shortcut: /#/assets?new=1 opens the new-asset modal
  const query = window.location.hash.split('?')[1] || '';
  if (new URLSearchParams(query).get('new') === '1') {
    history.replaceState(null, '', '#/assets');
    openAssetModal(null, members, reload);
  }

  document.getElementById('f-q').oninput = () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(reload, 200);
  };
  document.getElementById('f-group').onchange = reload;
  document.getElementById('f-member').onchange = reload;

  bindRowActions(currentAssets, members, reload);
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
              ${a.subtype_name ? `<div class="muted-sm">${escapeHtml(a.subtype_name)}</div>` : ''}
            </td>
            <td>${a.member_id ? `<span class="member-chip" style="background:${escapeHtml(a.member_color)}">${escapeHtml(a.member_name)}</span>` : '—'}</td>
            <td class="num">${['bank', 'tien-gui', 'cho-vay', 'di-vay'].includes(a.group_id) ? '—' : `${a.qty || 0} ${escapeHtml(a.unit || '')}`}</td>
            <td class="num"><strong>${fmtVND(a.value)}</strong></td>
            <td class="num ${a.pnl == null ? '' : (a.pnl >= 0 ? 'pos' : 'neg')}">
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
  if (a.term) bits.push(`Kỳ hạn: ${a.term} tháng`);
  if (a.maturity_date) bits.push('Đáo hạn: ' + a.maturity_date);
  if (a.interest_rate != null && a.interest_rate !== '') bits.push(a.interest_rate + '%');
  if (a.notes) bits.push(a.notes);
  if (!bits.length) return '';
  return `<div class="muted-sm">${bits.map(escapeHtml).join(' · ')}</div>`;
}

function bindRowActions(assets, members, reload) {
  document.querySelectorAll('#asset-list tr[data-id]').forEach((tr) => {
    const id = Number(tr.dataset.id);
    const asset = assets.find((a) => a.id === id);
    tr.querySelector('[data-act="edit"]').onclick = () => openAssetModal(asset, members, reload);
    tr.querySelector('[data-act="del"]').onclick = async () => {
      if (!confirm(`Xoá tài sản "${asset.name}"?`)) return;
      try {
        await api.del('/assets/' + id);
        toast('Đã xoá');
        await reload();
      } catch (err) {
        toast('Lỗi: ' + err.message);
      }
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
// Form behaviour (Bank: show savings fields only for term-savings subtypes;
// tiền gửi + bank savings: bidirectional start/maturity/term auto-fill)
// ────────────────────────────────────────────────────────────────────────────
function bindFormBehaviour(groupId, formBody) {
  if (groupId === 'tien-gui') {
    bindTermTrio(formBody);
    return;
  }
  if (groupId !== 'bank') return;

  const subtypeEl = formBody.querySelector('select[name="subtype"]');
  const savingsEls = formBody.querySelectorAll('[data-bank-savings]');
  bindTermTrio(formBody);
  if (!subtypeEl || !savingsEls.length) return;

  const toggle = () => {
    const show = BANK_SAVINGS_SUBTYPES.includes(subtypeEl.value);
    savingsEls.forEach((el) => { el.style.display = show ? '' : 'none'; });
  };
  subtypeEl.addEventListener('change', toggle);
  toggle();
}

// ─── Term/date trio: any 2 of {start_date, maturity_date, term} → 3rd ──────
// When user edits one field, prefer to keep `term` sticky (it represents an
// intentional choice), so editing a date recomputes the *other* date when
// term is set.
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
// Submit handler — collects form data, posts to API
// ────────────────────────────────────────────────────────────────────────────
function bindSubmit(groupId, formBody, asset, editing, reload) {
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
      toast('Lỗi: ' + err.message);
    }
  };
}
