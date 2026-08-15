import { api } from '../api.js';
import { escapeHtml, toast, rerender, fmtVND, openModal, closeModal, getCurrentUser, logout } from '../main.js';
import { TOPI_PID, normalizeTopiCaptures, findTopiCapture, topiProfileProducts } from '../../functions/api/_topi.js';

const INTEGRATION_DEFS = {
  tcbs: {
    label: 'TCBS',
    syncMode: 'fetch',
    assetTypes: [
      { id: 'co-phieu',   label: 'Cổ phiếu' },
      { id: 'trai-phieu', label: 'Trái phiếu' },
      { id: 'ccq',        label: 'Chứng chỉ quỹ' },
      { id: 'tien-mat',   label: 'Tiền / Ngân hàng' },
    ],
    fields: [
      { name: 'custody_code', label: 'Custody Code', placeholder: 'VD: 105C543780' },
      { name: 'tcbs_id',      label: 'TCBS ID',      placeholder: 'VD: 10000530071' },
    ],
  },
  topi: {
    label: 'Topi',
    syncMode: 'import',
    assetTypes: [
      { id: 'tien-gui', label: 'Tiền gửi' },
      { id: 'vang',     label: 'Vàng' },
    ],
    fields: [],
  },
};

const MARKET_SUBTYPE_LABELS = {
  vang:      'Vàng',
  usd:       'USD',
  'co-phieu': 'Cổ phiếu',
};

export async function renderSettings(view) {
  view.innerHTML = `
    <div class="page-header"><h1>⚙️ Cài đặt</h1></div>

    <div class="segmented segmented--fill" role="tablist">
      <button type="button" class="secondary active" data-tab="chung">Ứng dụng</button>
      <button type="button" class="secondary" data-tab="nguoi-dung">Tài khoản</button>
      <button type="button" class="secondary" data-tab="toan-cuc">Chung</button>
    </div>

    <div class="settings-panel" data-tab="chung">
      <div class="section">
        <h2>👤 Tài khoản</h2>
        <div id="account-info" style="margin-bottom:12px;"></div>
        <form id="password-form" class="form-grid">
          <label class="full">Mật khẩu hiện tại
            <input name="current_password" type="password" required autocomplete="current-password" />
          </label>
          <label class="full">Mật khẩu mới (tối thiểu 8 ký tự)
            <input name="new_password" type="password" required minlength="8" autocomplete="new-password" />
          </label>
          <div class="modal-actions full">
            <button type="button" id="btn-logout-settings" class="secondary">Đăng xuất</button>
            <button type="submit">Đổi mật khẩu</button>
          </div>
        </form>
      </div>

      <div class="section">
        <h2>🔔 Thông báo nhắc nhở</h2>
        <p class="muted-sm" style="margin: -8px 0 12px;">
          Nhắc hằng ngày khi có tài sản sắp đáo hạn, đến ngày nhận lãi (cho vay) hoặc trả lãi (đi vay).
        </p>
        <div id="notify-section"></div>
      </div>

      <div class="section">
        <h2>Ứng dụng</h2>
        <p class="muted-sm" style="margin: -8px 0 12px;">Kiểm tra và áp dụng phiên bản mới nhất của ứng dụng.</p>
        <p class="muted-sm" style="margin: -4px 0 12px; font-family: monospace;">
          ${__GIT_SHA__} &mdash; ${__GIT_MESSAGE__}<br>
          ${__GIT_TIMESTAMP__}
        </p>
        <div class="toolbar">
          <button type="button" id="btn-force-reload">↺ Tải phiên bản mới nhất</button>
        </div>
      </div>
    </div>

    <div class="settings-panel" data-tab="nguoi-dung" hidden>
      <div class="section">
        <h2>👥 Thành viên</h2>
        <p class="muted-sm" style="margin: -8px 0 12px;">Quản lý thành viên dùng để gắn tài sản.</p>
        <div id="member-list"></div>
        <div class="toolbar" style="margin-top:12px;">
          <button type="button" id="btn-new-member">+ Thêm thành viên</button>
        </div>
      </div>

      <div class="section">
        <h2>🔗 Tích hợp dịch vụ</h2>
        <p class="muted-sm" style="margin: -8px 0 12px;">Kết nối TCBS, Topi... để đồng bộ tài sản tự động.</p>
        <div id="integrations-section"></div>
      </div>

      <div class="section">
        <h2>Sao lưu &amp; phục hồi (JSON)</h2>
        <p class="muted-sm" style="margin: -8px 0 12px;">
          Xuất toàn bộ dữ liệu ra file JSON để sao lưu, hoặc nhập lại từ file đã xuất.
        </p>

        <div class="toolbar">
          <button type="button" id="export-btn">⬇️ Xuất JSON</button>
        </div>

        <form id="import-form" class="toolbar" style="align-items:center;">
          <input type="file" id="import-file" accept="application/json,.json" required />
          <select id="import-mode">
            <option value="replace">Replace — xoá hết rồi nạp lại</option>
            <option value="merge">Merge — thêm vào dữ liệu hiện có</option>
          </select>
          <button type="submit" class="secondary">⬆️ Nhập JSON</button>
        </form>
        <p class="muted-sm">
          Chế độ <b>Replace</b> giữ nguyên ID gốc — phù hợp khi khôi phục backup.
          Chế độ <b>Merge</b> gán ID mới và nối tiếp dữ liệu cũ.
        </p>
      </div>
    </div>

    <div class="settings-panel" data-tab="toan-cuc" hidden>
      <div class="section">
        <h2>Nền tảng tiền gửi</h2>
        <p class="muted-sm" style="margin: -8px 0 12px;">Danh sách dùng cho form Tiền gửi. Có thể thêm hoặc xoá tuỳ ý.</p>
        <div id="platform-list" class="chip-list"></div>
        <form id="platform-form" class="toolbar" style="margin-top:12px;">
          <input id="platform-name" placeholder="Tên nền tảng (VD: Topi)" required style="flex:1; min-width:200px;" />
          <button type="submit">+ Thêm nền tảng</button>
        </form>
      </div>

      <div class="section">
        <h2>Giá thị trường</h2>
        <p class="muted-sm" style="margin: -8px 0 12px;">Nguồn dữ liệu giá thị trường.</p>
        <div id="market-settings"></div>
      </div>
    </div>
  `;

  setupTabs(view);
  renderAccount();
  document.getElementById('btn-logout-settings').onclick = logout;
  document.getElementById('password-form').onsubmit = onChangePassword;

  await reloadMembers();
  await reloadPlatforms();
  await reloadMarketSettings();
  await reloadIntegrations();
  await reloadNotifySection();

  document.getElementById('btn-new-member').onclick = () => openMemberModal();

  document.getElementById('platform-form').onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('platform-name');
    const name = input.value.trim();
    if (!name) return;
    const submitBtn = e.target.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.classList.add('btn-loading');
    try {
      await api.post('/platforms', { name });
      input.value = '';
      toast('Đã thêm');
      await reloadPlatforms();
    } catch (err) {
      toast('Lỗi: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn-loading');
    }
  };

  document.getElementById('btn-force-reload').onclick = onForceReload;
  document.getElementById('export-btn').onclick = onExport;
  document.getElementById('import-form').onsubmit = onImport;
}

function setupTabs(view) {
  const tabs = view.querySelectorAll('.segmented button');
  const panels = view.querySelectorAll('.settings-panel');
  tabs.forEach((btn) => {
    btn.onclick = () => {
      const target = btn.dataset.tab;
      tabs.forEach((b) => b.classList.toggle('active', b === btn));
      panels.forEach((p) => { p.hidden = p.dataset.tab !== target; });
    };
  });
}

function renderAccount() {
  const user = getCurrentUser();
  const el = document.getElementById('account-info');
  if (!el || !user) return;
  el.innerHTML = `
    <div><strong>${escapeHtml(user.name)}</strong></div>
    <div class="muted-sm">${escapeHtml(user.email)}</div>
  `;
}

async function onChangePassword(e) {
  e.preventDefault();
  const form = e.target;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  submit.classList.add('btn-loading');
  try {
    await api.post('/auth/password', {
      current_password: form.current_password.value,
      new_password: form.new_password.value,
    });
    form.reset();
    toast('Đã đổi mật khẩu');
  } catch (err) {
    toast('Lỗi: ' + err.message);
  } finally {
    submit.disabled = false;
    submit.classList.remove('btn-loading');
  }
}

async function reloadMarketSettings() {
  const container = document.getElementById('market-settings');
  if (!container) return;

  const [providers, settings] = await Promise.all([
    api.get('/providers'),
    api.get('/settings'),
  ]);

  // Group providers by subtype
  const bySubtype = {};
  for (const p of providers) {
    for (const st of p.subtypes) {
      if (!bySubtype[st]) bySubtype[st] = [];
      bySubtype[st].push(p);
    }
  }

  const subtypes = Object.keys(MARKET_SUBTYPE_LABELS);
  const providerRows = subtypes.map((st) => {
    const label = MARKET_SUBTYPE_LABELS[st];
    const list = bySubtype[st] || [];
    const defaultId = settings[`market.provider.${st}`];
    const rows = list.map((p) => {
      const cache = settings[`market.cache.${st}.${p.id}`];
      let priceLabel;
      if (!cache) {
        priceLabel = '<span class="muted-sm">—</span>';
      } else if (cache.prices) {
        // Per-ticker provider: show how many tickers were fetched
        const count = Object.keys(cache.prices).length;
        const timeStr = new Date(cache.fetched_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
        priceLabel = `${count} mã <span class="muted-sm">${timeStr}</span>`;
      } else {
        priceLabel = `${fmtVND(cache.price)} <span class="muted-sm">${new Date(cache.fetched_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span>`;
      }
      const isDefault = defaultId === p.id;
      return `
        <div class="provider-row${isDefault ? ' provider-row--default' : ''}"
             data-provider="${escapeHtml(p.id)}" data-subtype="${escapeHtml(st)}">
          <span class="provider-name">${escapeHtml(p.name)}</span>
          <span class="provider-price">${priceLabel}</span>
          <button type="button" class="btn-provider-refresh icon-btn" title="Lấy giá">↻</button>
          <label class="provider-toggle" title="Đặt mặc định">
            <input type="radio" name="provider-default-${escapeHtml(st)}" value="${escapeHtml(p.id)}" ${isDefault ? 'checked' : ''} class="btn-provider-default">
            <span class="provider-toggle-track"></span>
          </label>
        </div>`;
    }).join('');
    return `<div class="market-subtype"><h3>${escapeHtml(label)}</h3>${rows}</div>`;
  }).join('');

  container.innerHTML = `
    ${providerRows}
    <div class="toolbar" style="margin-top:12px;">
      <button type="button" id="btn-fetch-all">↻ Làm mới tất cả</button>
    </div>
  `;

  // Provider 🔄 buttons
  container.querySelectorAll('.btn-provider-refresh').forEach((btn) => {
    btn.onclick = async () => {
      const row = btn.closest('[data-provider]');
      const providerId = row.dataset.provider;
      const subtype = row.dataset.subtype;
      btn.disabled = true;
      try {
        const res = await api.post('/market-data/fetch', { provider: providerId, subtype });
        const r = res.results?.[0];
        if (r?.error) {
          toast('Lỗi: ' + r.error);
        } else {
          const updated = r?.assetsUpdated ?? 0;
          let msg;
          if (!r?.isDefault) {
            msg = 'Đã lấy giá (không phải nhà cung cấp mặc định)';
          } else if (updated > 0) {
            msg = `Đã cập nhật giá — ${updated} tài sản`;
          } else {
            msg = 'Đã lấy giá (chưa có tài sản thuộc loại này)';
          }
          toast(msg);
          await reloadMarketSettings();
        }
      } catch (err) {
        toast('Lỗi: ' + err.message);
      } finally {
        btn.disabled = false;
      }
    };
  });

  // Provider default toggle radios
  container.querySelectorAll('.btn-provider-default').forEach((input) => {
    input.onchange = async () => {
      const row = input.closest('[data-provider]');
      const providerId = row.dataset.provider;
      const subtype = row.dataset.subtype;
      try {
        await api.post('/settings', { key: `market.provider.${subtype}`, value: providerId });
        toast('Đã đặt mặc định');
        await reloadMarketSettings();
      } catch (err) {
        toast('Lỗi: ' + err.message);
      }
    };
  });

  // Fetch all button
  document.getElementById('btn-fetch-all').onclick = async () => {
    const btn = document.getElementById('btn-fetch-all');
    btn.disabled = true;
    btn.textContent = '↻ Đang lấy giá...';
    try {
      const res = await api.post('/market-data/fetch', {});
      const errs = (res.results || []).filter((r) => r.error);
      let msg = `Đã cập nhật giá — ${res.assetsUpdated ?? 0} tài sản`;
      if (errs.length) {
        msg += ` · Lỗi: ${errs.map((e) => `${e.provider} (${e.error})`).join('; ')}`;
      }
      toast(msg);
      await reloadMarketSettings();
    } catch (err) {
      toast('Lỗi: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '↻ Làm mới tất cả';
    }
  };
}

async function reloadPlatforms() {
  const platforms = await api.get('/platforms');
  const list = document.getElementById('platform-list');
  if (!platforms.length) {
    list.innerHTML = '<div class="empty">Chưa có nền tảng</div>';
    return;
  }
  list.innerHTML = platforms.map((p) => `
    <span class="chip" data-id="${p.id}">
      ${escapeHtml(p.name)}
      <button type="button" class="chip-x" aria-label="Xoá ${escapeHtml(p.name)}">✕</button>
    </span>
  `).join('');
  list.querySelectorAll('.chip').forEach((el) => {
    const id = Number(el.dataset.id);
    const chipBtn = el.querySelector('.chip-x');
    chipBtn.onclick = async () => {
      if (!confirm('Xoá nền tảng này?')) return;
      chipBtn.disabled = true;
      try {
        await api.del('/platforms?id=' + id);
        await reloadPlatforms();
      } catch (err) {
        chipBtn.disabled = false;
        toast('Lỗi: ' + err.message);
      }
    };
  });
}

async function onExport() {
  try {
    const dump = await api.get('/export');
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-export-${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Đã xuất file');
  } catch (err) {
    toast('Lỗi: ' + err.message);
  }
}

async function onForceReload() {
  const btn = document.getElementById('btn-force-reload');
  btn.disabled = true;
  btn.textContent = '↺ Đang kiểm tra...';

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (reg) {
        await reg.update();
        if (reg.waiting) {
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
          }, { once: true });
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          return;
        }
      }
    }
    // No new SW — clear caches and hard reload
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    window.location.reload();
  } catch {
    window.location.reload();
  }
}

async function reloadMembers() {
  const members = await api.get('/members');
  const list = document.getElementById('member-list');
  if (!list) return;
  if (!members.length) {
    list.innerHTML = '<div class="empty">Chưa có thành viên</div>';
    return;
  }
  list.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Tên</th><th>Màu</th></tr></thead>
      <tbody>
        ${members.map((m) => `
          <tr>
            <td><span class="member-chip" style="background:${escapeHtml(m.color)}">${escapeHtml(m.name)}</span></td>
            <td><code>${escapeHtml(m.color)}</code></td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
}

function openMemberModal() {
  openModal(`
    <h3>Thêm thành viên</h3>
    <form id="member-form" class="form-grid">
      <label class="full">Tên
        <input name="name" required />
      </label>
      <label class="full">Màu
        <input name="color" type="color" value="#3b82f6" />
      </label>
      <div class="modal-actions full">
        <button type="button" class="secondary" id="cancel">Huỷ</button>
        <button type="submit">Tạo</button>
      </div>
    </form>
  `, (root) => {
    root.querySelector('#cancel').onclick = closeModal;
    root.querySelector('#member-form').onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.classList.add('btn-loading');
      const fd = new FormData(e.target);
      try {
        await api.post('/members', Object.fromEntries(fd.entries()));
        toast('Đã thêm');
        closeModal();
        await reloadMembers();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn-loading');
        toast('Lỗi: ' + err.message);
      }
    };
  });
}

async function onImport(e) {
  e.preventDefault();
  const fileInput = document.getElementById('import-file');
  const mode = document.getElementById('import-mode').value;
  const file = fileInput.files?.[0];
  if (!file) {
    toast('Hãy chọn file JSON');
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch (err) {
    toast('File JSON không hợp lệ');
    return;
  }
  if (!payload || !payload.data) {
    toast('File thiếu trường "data"');
    return;
  }

  const msg = mode === 'replace'
    ? 'Chế độ REPLACE sẽ XOÁ toàn bộ dữ liệu hiện tại rồi nạp lại từ file. Tiếp tục?'
    : 'Nhập (merge) dữ liệu từ file vào dữ liệu hiện tại?';
  if (!confirm(msg)) return;

  try {
    const res = await api.post('/import', { mode, data: payload.data });
    const lines = Object.entries(res.stats || {})
      .map(([t, n]) => `${t}: ${n}`)
      .join(', ');
    toast(`Đã nhập (${mode}) — ${lines}`);
    fileInput.value = '';
    rerender();
  } catch (err) {
    toast('Lỗi: ' + err.message);
  }
}

// ─── Integrations ─────────────────────────────────────────────────────────────

async function reloadIntegrations() {
  const container = document.getElementById('integrations-section');
  if (!container) return;

  const [settings, members] = await Promise.all([
    api.get('/user-settings'),
    api.get('/members'),
  ]);

  const serviceBlocks = Object.entries(INTEGRATION_DEFS).map(([serviceId, def]) => {
    const instances = parseInstances(settings[`integration.${serviceId}.instances`]);
    const cards = instances.map((inst) => renderInstanceCard(serviceId, def, inst, members)).join('');
    return `
      <div class="market-subtype" data-service="${escapeHtml(serviceId)}">
        <h3>${escapeHtml(def.label)}</h3>
        <div class="instance-list">${cards || '<div class="muted-sm" style="padding:6px 0;">Chưa có kết nối</div>'}</div>
        <div class="toolbar" style="margin-top:8px; margin-bottom:0;">
          <button type="button" class="btn-add-instance small">+ Thêm kết nối</button>
          <button type="button" class="btn-bookmarklet small secondary">📌 Bookmarklet</button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = serviceBlocks;

  container.querySelectorAll('.btn-add-instance').forEach((btn) => {
    const serviceEl = btn.closest('[data-service]');
    const serviceId = serviceEl.dataset.service;
    btn.onclick = () => openInstanceModal(serviceId, null, members);
  });

  container.querySelectorAll('.btn-bookmarklet').forEach((btn) => {
    const serviceEl = btn.closest('[data-service]');
    const serviceId = serviceEl.dataset.service;
    btn.onclick = () => openBookmarkletModal(serviceId, INTEGRATION_DEFS[serviceId]);
  });

  bindInstanceCardActions(container);
}

function parseInstances(raw) {
  if (!raw) return [];
  try { return Array.isArray(raw) ? raw : JSON.parse(raw); } catch { return []; }
}

function jwtPayload(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function jwtExpiry(token) {
  const payload = jwtPayload(token);
  return payload?.exp ? new Date(payload.exp * 1000) : null;
}

function setCardSyncTime(card, iso) {
  const el = card?.querySelector('.instance-sync-time');
  if (el) el.textContent = fmtSyncTime(iso);
}

function fmtSyncTime(iso) {
  if (!iso) return 'Chưa đồng bộ';
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function renderInstanceCard(serviceId, def, inst, members) {
  const member = members.find((m) => m.id === inst.member_id);
  const memberChip = member
    ? `<span class="member-chip" style="background:${escapeHtml(member.color)}">${escapeHtml(member.name)}</span>`
    : '';

  const hasToken = def.syncMode !== 'import';

  let tokenBadge = '';
  if (hasToken) {
    const expiry = jwtExpiry(inst.token);
    if (expiry) {
      const expired = expiry < new Date();
      const timeStr = expiry.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
      tokenBadge = expired
        ? `<span class="badge neg">Hết hạn · ${escapeHtml(timeStr)}</span>`
        : `<span class="badge pos">Còn hạn · ${escapeHtml(timeStr)}</span>`;
    }
  }

  const metaRows = [
    `<span>Đồng bộ: <span class="instance-sync-time muted-sm">${escapeHtml(fmtSyncTime(inst.last_sync))}</span></span>`,
  ];
  if (serviceId === 'tcbs') {
    const payload = jwtPayload(inst.token) || {};
    if (inst.custody_code) {
      const match = payload.custodyID && String(payload.custodyID) === inst.custody_code
        ? ` <span class="custody-match" title="Khớp với token">✅</span>`
        : '';
      metaRows.push(`<span>Custody ID: <code>${escapeHtml(inst.custody_code)}</code>${match}</span>`);
    }
    if (inst.tcbs_id) {
      const match = payload.tcbsId && String(payload.tcbsId) === inst.tcbs_id
        ? ` <span class="custody-match" title="Khớp với token">✅</span>`
        : '';
      metaRows.push(`<span>TCBS ID: <code>${escapeHtml(inst.tcbs_id)}</code>${match}</span>`);
    }
    if (payload.email) metaRows.push(`<span>Email: <code>${escapeHtml(payload.email)}</code></span>`);
  }
  const metaLine = `<div class="instance-meta">${metaRows.join('')}</div>`;

  const checkboxes = def.assetTypes.map((t) => `
    <label class="check-label">
      <input type="checkbox" class="asset-type-check" value="${escapeHtml(t.id)}" checked>
      ${escapeHtml(t.label)}
    </label>
  `).join('');

  return `
    <div class="instance-card" data-service="${escapeHtml(serviceId)}" data-id="${escapeHtml(inst.id)}" data-name="${escapeHtml(inst.name)}">
      <div class="instance-header">
        <div class="instance-info">
          <strong>${escapeHtml(inst.name)}</strong>
          ${memberChip}
          ${tokenBadge}
        </div>
        <div class="instance-actions">
          ${hasToken
            ? `<button type="button" class="btn-sync icon-btn small" title="Đồng bộ">↻</button>
               <button type="button" class="btn-update-token icon-btn small" title="Cập nhật token">🔑</button>`
            : `<button type="button" class="btn-import-json icon-btn small" title="Import JSON">📂</button>`
          }
          <button type="button" class="btn-delete-instance icon-btn small" title="Xoá kết nối" style="color:var(--danger)">✕</button>
        </div>
      </div>
      ${hasToken ? `
      <div class="token-update-form" hidden>
        <form class="toolbar" style="margin: 0 12px 8px; gap:6px;">
          <input type="text" class="token-input" placeholder="Paste token mới vào đây..." style="flex:1; min-width:0;" />
          <button type="submit" class="small">Lưu</button>
          <button type="button" class="small secondary btn-cancel-token">Huỷ</button>
        </form>
      </div>` : ''}
      <div class="instance-body">
        ${metaLine}
        <div class="asset-type-checklist">
          ${checkboxes}
        </div>
      </div>
    </div>
  `;
}

function bindInstanceCardActions(container) {
  container.querySelectorAll('.instance-card').forEach((card) => {
    const serviceId = card.dataset.service;
    const instanceId = card.dataset.id;
    const def = INTEGRATION_DEFS[serviceId];

    if (def.syncMode !== 'import') {
      card.querySelector('.btn-update-token').onclick = () => {
        const form = card.querySelector('.token-update-form');
        form.hidden = !form.hidden;
        if (!form.hidden) card.querySelector('.token-input').focus();
      };
      card.querySelector('.btn-cancel-token').onclick = () => {
        card.querySelector('.token-update-form').hidden = true;
      };
      card.querySelector('.token-update-form').onsubmit = async (e) => {
        e.preventDefault();
        const newToken = card.querySelector('.token-input').value.trim();
        if (!newToken) return;
        const btn = e.target.querySelector('[type="submit"]');
        btn.disabled = true;
        try {
          await updateInstanceField(serviceId, instanceId, { token: newToken });
          toast('Đã cập nhật token');
          await reloadIntegrations();
        } catch (err) {
          toast('Lỗi: ' + err.message);
          btn.disabled = false;
        }
      };
    }

    card.querySelector('.btn-delete-instance').onclick = () => {
      openDeleteInstanceDialog(serviceId, instanceId);
    };

    if (def.syncMode === 'import') {
      card.querySelector('.btn-import-json').onclick = () =>
        openImportJsonModal(serviceId, def, instanceId, card.dataset.name, card);
    } else {
      card.querySelector('.btn-sync').onclick = async () => {
        const btn = card.querySelector('.btn-sync');
        const assetTypes = [...card.querySelectorAll('.asset-type-check:checked')].map((c) => c.value);
        if (!assetTypes.length) { toast('Chọn ít nhất 1 loại tài sản'); return; }
        btn.disabled = true;
        btn.textContent = '↻ Đang đồng bộ...';
        try {
          const res = await api.post('/sync', { service: serviceId, instance_id: instanceId, asset_types: assetTypes });
          setCardSyncTime(card, res.synced_at);
          toast(`Đã đồng bộ: +${res.added} mới · ~${res.updated} cập nhật · -${res.removed} đóng`);
        } catch (err) {
          toast('Lỗi: ' + err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = '↻ Đồng bộ';
        }
      };
    }
  });
}

async function updateInstanceField(serviceId, instanceId, fields) {
  const settings = await api.get('/user-settings');
  const instances = parseInstances(settings[`integration.${serviceId}.instances`]);
  const idx = instances.findIndex((i) => i.id === instanceId);
  if (idx === -1) throw new Error('Instance not found');
  instances[idx] = { ...instances[idx], ...fields };
  await api.post('/user-settings', { key: `integration.${serviceId}.instances`, value: instances });
}

function openDeleteInstanceDialog(serviceId, instanceId) {
  openModal(`
    <h3>Xoá kết nối?</h3>
    <p>Bạn muốn làm gì với tài sản đã đồng bộ từ kết nối này?</p>
    <div class="modal-actions full" style="flex-direction:column; gap:8px;">
      <button type="button" id="del-keep">Giữ lại tài sản</button>
      <button type="button" class="danger" id="del-assets">Xoá cả tài sản</button>
      <button type="button" class="secondary" id="del-cancel">Huỷ</button>
    </div>
  `, (root) => {
    root.querySelector('#del-cancel').onclick = closeModal;

    root.querySelector('#del-keep').onclick = async () => {
      const btn = root.querySelector('#del-keep');
      btn.disabled = true;
      try {
        await removeInstance(serviceId, instanceId);
        toast('Đã xoá kết nối');
        closeModal();
        await reloadIntegrations();
      } catch (err) {
        toast('Lỗi: ' + err.message);
        btn.disabled = false;
      }
    };

    root.querySelector('#del-assets').onclick = async () => {
      const btn = root.querySelector('#del-assets');
      btn.disabled = true;
      try {
        await api.del(`/sync?service=${encodeURIComponent(serviceId)}&instance_id=${encodeURIComponent(instanceId)}`);
        await removeInstance(serviceId, instanceId);
        toast('Đã xoá kết nối và tài sản');
        closeModal();
        await reloadIntegrations();
      } catch (err) {
        toast('Lỗi: ' + err.message);
        btn.disabled = false;
      }
    };
  });
}

async function removeInstance(serviceId, instanceId) {
  const settings = await api.get('/user-settings');
  const instances = parseInstances(settings[`integration.${serviceId}.instances`]);
  await api.post('/user-settings', {
    key: `integration.${serviceId}.instances`,
    value: instances.filter((i) => i.id !== instanceId),
  });
}

const TOPI_TYPE_LABELS = {
  'tien-gui': { label: 'Tiền gửi', qtyUnit: '' },
  vang:       { label: 'Vàng',     qtyUnit: 'chỉ' },
};

// → { [assetType]: items[] }, with a key present only for the responses we
// recognised. An empty array is meaningful, not a parse failure: that product
// type was sold off, so importing should close out its assets.
function previewTopiBundle(rawData) {
  const captures = normalizeTopiCaptures(rawData);
  const found = {};
  for (const assetType of Object.keys(TOPI_TYPE_LABELS)) {
    const cap = findTopiCapture(captures, TOPI_PID[assetType]);
    if (!cap) continue;
    found[assetType] = topiProfileProducts(cap.data).map(({ product, pp }) => ({
      name: (pp.ProductName || product.ProductName || '').slice(0, 40),
      qty: pp.Quantity ?? 1,
      totalValue: pp.TotalValue ?? 0,
    }));
  }
  return found;
}

function renderTopiPreview(found) {
  const types = Object.keys(found);
  if (!types.length) {
    return '<p class="muted-sm" style="margin-top:10px; color:var(--danger);">Không nhận dạng được response — cần <code>GetBalanceProfileProduct</code> kèm <code>ProfileProductPNL</code> để biết đây là Tiền gửi hay Vàng.</p>';
  }

  return types.map((assetType) => {
    const { label, qtyUnit } = TOPI_TYPE_LABELS[assetType];
    const items = found[assetType];

    if (!items.length) {
      return `
        <div style="margin-top:10px;">
          <strong>${label}</strong>
          <p class="muted-sm" style="margin:4px 0 0; color:var(--danger);">Không còn tài sản — import sẽ đóng toàn bộ ${label} của kết nối này.</p>
        </div>`;
    }

    const total = items.reduce((s, i) => s + i.totalValue, 0);
    const rows = items.map((i) => `
      <li style="display:flex; justify-content:space-between; gap:8px; padding:4px 0; border-bottom:1px solid var(--border);">
        <span>${escapeHtml(i.name)}</span>
        <span class="muted-sm">${qtyUnit && i.qty > 1 ? `${i.qty} ${qtyUnit} · ` : ''}${fmtVND(i.totalValue)}</span>
      </li>`).join('');
    return `
      <div style="margin-top:10px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <strong>${label}</strong>
          <span class="muted-sm">${items.length} mục · ${fmtVND(total)}</span>
        </div>
        <ul style="list-style:none; padding:0; margin:4px 0 0;">${rows}</ul>
      </div>`;
  }).join('');
}

function openImportJsonModal(serviceId, def, instanceId, instanceName, card) {
  openModal(`
    <h3>Import dữ liệu ${escapeHtml(def.label)}</h3>
    <p>Kết nối: <strong>${escapeHtml(instanceName)}</strong></p>
    <p class="muted-sm">
      Click bookmarklet 📌 trên <b>${escapeHtml(def.label)}</b> → mở tab Tiền gửi / Vàng →
      click lại bookmarklet → bấm 📋 để copy → dán vào đây.
      Hoặc tự bắt request <code>GetBalanceProfileProduct</code> (F12 → Network, proxy như Reqable)
      rồi dán thân response — nhiều response thì gộp thành mảng <code>[response1, response2]</code>.
    </p>
    <form id="json-import-form" class="form-grid">
      <label class="full">Dữ liệu JSON
        <textarea name="json" rows="7" placeholder='{"captures":[...]}  hoặc  {"Code":0,"Data":{"ListProduct":[...]}}'></textarea>
      </label>
      <div id="import-preview" class="full" style="grid-column: 1 / -1;"></div>
      <div class="modal-actions full" style="grid-column: 1 / -1;">
        <button type="button" class="secondary" id="cancel">Huỷ</button>
        <button type="submit">Import</button>
      </div>
    </form>
  `, (root) => {
    const form = root.querySelector('#json-import-form');
    const preview = root.querySelector('#import-preview');
    let parsedRaw = null;

    root.querySelector('#cancel').onclick = closeModal;

    const showError = (msg) => {
      preview.innerHTML = `<p class="muted-sm" style="color:var(--danger); margin-top:10px;">${escapeHtml(msg)}</p>`;
    };

    // parsedRaw stays null until the payload is a response we recognise, so
    // Import can't submit something that would close out the wrong assets.
    const load = (text) => {
      parsedRaw = null;
      preview.innerHTML = '';
      if (!text.trim()) return;

      let raw;
      try {
        raw = JSON.parse(text);
      } catch (err) {
        showError(`JSON không hợp lệ: ${err.message}`);
        return;
      }

      if (serviceId !== 'topi') { parsedRaw = raw; return; }

      let found;
      try {
        found = previewTopiBundle(raw);
      } catch (err) {
        showError(err.message);
        return;
      }
      preview.innerHTML = renderTopiPreview(found);
      // Gate on "did we recognise a response", not "did it hold anything" — a
      // recognised-but-empty one is how a sold-off product type gets closed.
      if (Object.keys(found).length) parsedRaw = raw;
    };

    form.json.oninput = () => load(form.json.value);

    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!parsedRaw) { toast('Dán dữ liệu JSON hợp lệ trước'); return; }
      const assetTypes = [...card.querySelectorAll('.asset-type-check:checked')].map((c) => c.value);
      if (!assetTypes.length) { toast('Chọn ít nhất 1 loại tài sản'); return; }
      const submitBtn = e.target.querySelector('[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.classList.add('btn-loading');
      try {
        const res = await api.post('/sync', {
          service: serviceId,
          instance_id: instanceId,
          asset_types: assetTypes,
          raw_data: parsedRaw,
        });
        setCardSyncTime(card, res.synced_at);
        toast(`Đã import: +${res.added} mới · ~${res.updated} cập nhật · -${res.removed} đóng`);
        closeModal();
      } catch (err) {
        toast('Lỗi: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn-loading');
      }
    };
  });
}

function openInstanceModal(serviceId, existing, members) {
  const def = INTEGRATION_DEFS[serviceId];
  const editing = !!existing;
  const inst = existing || {};

  const extraFields = def.fields.map((f) => `
    <label class="full">${escapeHtml(f.label)}
      <input name="${escapeHtml(f.name)}" value="${escapeHtml(inst[f.name] || '')}" placeholder="${escapeHtml(f.placeholder || '')}" required />
    </label>
  `).join('');

  openModal(`
    <h3>${editing ? 'Sửa' : 'Thêm'} kết nối ${escapeHtml(def.label)}</h3>
    <form id="instance-form" class="form-grid">
      <label class="full">Tên kết nối
        <input name="name" required value="${escapeHtml(inst.name || '')}" placeholder="VD: Tài khoản chính" />
      </label>
      ${def.syncMode !== 'import' ? `
      <label class="full">Access token
        <textarea name="token" rows="3" required placeholder="Paste token từ trình duyệt vào đây...">${escapeHtml(inst.token || '')}</textarea>
      </label>` : ''}
      ${extraFields}
      <label class="full">Thành viên
        <select name="member_id">
          <option value="">— Không —</option>
          ${members.map((m) => `<option value="${m.id}" ${inst.member_id === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
        </select>
      </label>
      <div class="modal-actions full">
        <button type="button" class="secondary" id="cancel">Huỷ</button>
        <button type="submit">${editing ? 'Cập nhật' : 'Tạo'}</button>
      </div>
    </form>
  `, (root) => {
    root.querySelector('#cancel').onclick = closeModal;
    root.querySelector('#instance-form').onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.classList.add('btn-loading');
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());

      const newInst = {
        id: inst.id || Date.now().toString(36),
        name: data.name.trim(),
        ...(def.syncMode !== 'import' && { token: data.token.trim() }),
        member_id: data.member_id ? Number(data.member_id) : null,
      };
      for (const f of def.fields) newInst[f.name] = data[f.name]?.trim() || '';

      try {
        const currentSettings = await api.get('/user-settings');
        const instances = parseInstances(currentSettings[`integration.${serviceId}.instances`]);
        if (editing) {
          const idx = instances.findIndex((i) => i.id === inst.id);
          if (idx !== -1) instances[idx] = newInst; else instances.push(newInst);
        } else {
          instances.push(newInst);
        }
        await api.post('/user-settings', { key: `integration.${serviceId}.instances`, value: instances });
        toast(editing ? 'Đã cập nhật' : 'Đã thêm kết nối');
        closeModal();
        await reloadIntegrations();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn-loading');
        toast('Lỗi: ' + err.message);
      }
    };
  });
}

// ─── Bookmarklet generator ────────────────────────────────────────────────────

function tcbsBookmarklet() {
  // Đọc token + TCBSId + custodyId từ localStorage['userInfo'],
  // hiển thị panel nổi (góc phải) cho phép copy từng giá trị.
  const code = `(function(){
var raw=localStorage.getItem('userInfo');
if(!raw){alert('Không tìm thấy userInfo.\\nHãy đăng nhập TCBS trước.');return;}
var info;
try{info=JSON.parse(raw);}catch(x){}
if(!info){alert('Lỗi đọc userInfo.');return;}
var token=info.authToken||'';
var tcbsId=info.TCBSId||info.tcbsId||'';
var custodyId=info.custodyId||info.custodyID||'';
if(!token){alert('Không tìm thấy authToken trong userInfo.');return;}
var exp='';
try{var p=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(p.exp)exp=new Date(p.exp*1000).toLocaleString('vi-VN');}catch(x){}
function copy(v,btn){navigator.clipboard.writeText(v).then(function(){var t=btn.textContent;btn.textContent='✅';setTimeout(function(){btn.textContent=t;},1200);}).catch(function(){prompt('Copy:',v);});}
function row(label,val){
  if(!val)return '';
  return '<div style="margin-bottom:10px"><div style="font-weight:600;color:#374151;margin-bottom:3px">'+label+'</div><div style="display:flex;gap:6px;align-items:center"><code style="flex:1;min-width:0;background:#f3f4f6;padding:4px 8px;border-radius:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+val+'">'+val+'</code><button data-v="'+encodeURIComponent(val)+'" style="cursor:pointer;border:none;background:#10b981;color:#fff;padding:4px 10px;border-radius:5px">📋</button></div></div>';
}
var old=document.getElementById('__tcbsPanel');if(old)old.remove();
var box=document.createElement('div');
box.id='__tcbsPanel';
box.style.cssText='position:fixed;top:12px;right:12px;z-index:2147483647;background:#fff;color:#111;padding:14px 16px;border-radius:10px;font:13px/1.5 sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.25);width:300px;border:1px solid #e5e7eb';
box.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><strong style="color:#10b981">TCBS — Copy thông tin</strong><span id="__tcbsClose" style="cursor:pointer;color:#9ca3af;font-size:18px;line-height:1">×</span></div>'+row('TCBS ID',tcbsId)+row('Custody Code',custodyId)+row('Token'+(exp?' (HH: '+exp+')':''),token);
document.body.appendChild(box);
box.querySelector('#__tcbsClose').onclick=function(){box.remove();};
Array.prototype.forEach.call(box.querySelectorAll('button[data-v]'),function(b){b.onclick=function(){copy(decodeURIComponent(b.getAttribute('data-v')),b);};});
})()`;
  return 'javascript:' + encodeURIComponent(code);
}

function topiBookmarklet() {
  // Patch fetch + XHR để bắt GetBalanceProfileProduct cho cả tiền gửi (pid 6) và vàng (pid 7).
  // Accumulate captures keyed by product_type_id (đọc từ response.data.Data.ProfileProductPNL.ProductTypeId).
  // Panel copy (giống bookmarklet TCBS) hiện ngay từ click đầu và tự cập nhật khi bắt được
  // response — dán thẳng vào ô Import, không qua file.
  const code = `(function(){
var TARGET='GetBalanceProfileProduct';
var LABELS={6:'Tiền gửi',7:'Vàng'};
function nameOf(pid){return LABELS[pid]||('pid '+pid);}
function pidOf(d){try{return Number(d.data.Data.ProfileProductPNL.ProductTypeId)||0;}catch(e){return 0;}}
function onData(d){
  var pid=pidOf(d);if(!pid)return;
  window.__topiBundle[pid]=d;
  showPanel();
}
function copy(v,btn){navigator.clipboard.writeText(v).then(function(){var t=btn.textContent;btn.textContent='✅';setTimeout(function(){btn.textContent=t;},1200);}).catch(function(){prompt('Copy:',v);});}
// Đếm đúng số mục sẽ được import: bỏ qua TotalValue <= 0 giống topiProfileProducts.
function countOf(d){
  var n=0;
  try{
    var lp=d.data.Data.ListProduct||[];
    for(var i=0;i<lp.length;i++){
      var pp=lp[i].ProfileProducts||[];
      for(var j=0;j<pp.length;j++){if((pp[j].TotalValue||0)>0)n++;}
    }
  }catch(e){}
  return n;
}
// Panel tự dựng lại mỗi lần bắt được response — không cần click bookmark lần 2.
function showPanel(){
  var pids=Object.keys(window.__topiBundle).sort();
  var old=document.getElementById('__topiPanel');if(old)old.remove();
  var box=document.createElement('div');
  box.id='__topiPanel';
  box.style.cssText='position:fixed;top:12px;right:12px;z-index:2147483647;background:#fff;color:#111;padding:14px 16px;border-radius:10px;font:13px/1.5 sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.25);width:300px;border:1px solid #e5e7eb';
  var head='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><strong style="color:#10b981">Topi — Copy dữ liệu</strong><span id="__topiClose" style="cursor:pointer;color:#9ca3af;font-size:18px;line-height:1">×</span></div>';
  var json='';
  if(!pids.length){
    box.innerHTML=head+'<div style="color:#6b7280;font-size:12px">Đang chờ dữ liệu — mở tab <b>Tiền gửi</b> / <b>Vàng</b> trên Topi.</div>';
  }else{
    var total=0;
    var parts=pids.map(function(pid){var c=countOf(window.__topiBundle[pid]);total+=c;return nameOf(pid)+': '+c;});
    json=JSON.stringify({captures:pids.map(function(pid){return {product_type_id:Number(pid),response:window.__topiBundle[pid]};})});
    box.innerHTML=head+'<div style="margin-bottom:10px"><div style="font-weight:600;color:#374151;margin-bottom:3px">'+parts.join(' · ')+'</div><div style="display:flex;gap:6px;align-items:center"><code style="flex:1;min-width:0;background:#f3f4f6;padding:4px 8px;border-radius:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Tổng '+total+' mục</code><button id="__topiCopy" style="cursor:pointer;border:none;background:#10b981;color:#fff;padding:4px 10px;border-radius:5px">📋</button></div></div><div style="color:#6b7280;font-size:12px">Dán vào Finance App → nút 📂 Import</div>';
  }
  document.body.appendChild(box);
  box.querySelector('#__topiClose').onclick=function(){box.remove();};
  var btn=box.querySelector('#__topiCopy');
  if(btn)btn.onclick=function(){copy(json,btn);};
}
if(window.__topiCap){showPanel();return;}
window.__topiCap=true;window.__topiBundle={};
var _f=window.fetch;
window.fetch=function(url){
  var p=_f.apply(this,arguments);
  if(String(url).indexOf(TARGET)!==-1){
    p.then(function(r){r.clone().json().then(onData).catch(function(){});});
  }
  return p;
};
var _open=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,url){
  if(String(url).indexOf(TARGET)!==-1){
    this.addEventListener('load',function(){
      try{onData(JSON.parse(this.responseText));}catch(e){}
    });
  }
  return _open.apply(this,arguments);
};
showPanel();
})()`;
  return 'javascript:' + encodeURIComponent(code);
}

function openBookmarkletModal(serviceId, def) {
  const isImport = def.syncMode === 'import';
  const href = isImport ? topiBookmarklet() : tcbsBookmarklet();

  const steps = isImport ? [
    `Mở <b>${escapeHtml(def.label)}</b> trên trình duyệt và đăng nhập`,
    'Click bookmark — panel hiện ở góc phải, chờ dữ liệu',
    'Mở tab <b>Tiền gửi</b> — panel cập nhật "Tiền gửi: N"',
    'Mở tab <b>Vàng</b> — panel cập nhật thêm "Vàng: N"',
    'Click 📋 trên panel để copy JSON chứa cả 2',
    'Dán vào Finance App qua nút 📂 Import',
    'Hoặc bỏ qua bookmarklet: bắt <code>GetBalanceProfileProduct</code> bằng proxy (Reqable, F12 → Network) rồi dán thẳng response JSON',
  ] : [
    `Mở <b>${escapeHtml(def.label)}</b> trên trình duyệt và đăng nhập`,
    'Click bookmark → panel hiện ở góc phải với <b>TCBS ID</b>, <b>Custody Code</b> và <b>Token</b>',
    'Click 📋 để copy từng giá trị — dán vào form tạo integration / ô "Cập nhật token" 🔑',
  ];

  openModal(`
    <h3>📌 Bookmarklet ${escapeHtml(def.label)}</h3>
    <p class="muted-sm">Kéo nút bên dưới vào <strong>Thanh Bookmarks</strong>:</p>
    <div style="text-align:center; padding:14px 0;">
      <a href="${href}" class="btn" draggable="true" onclick="return false;"
         style="display:inline-block; cursor:grab; user-select:none;">
        📌 ${escapeHtml(def.label)} Capture
      </a>
    </div>
    <ol class="muted-sm" style="margin:8px 0 0; padding-left:20px; line-height:2;">
      ${steps.map((s) => `<li>${s}</li>`).join('')}
    </ol>
    <div class="modal-actions full" style="margin-top:16px;">
      <button type="button" id="bm-close">Đóng</button>
    </div>
  `, (root) => {
    root.querySelector('#bm-close').onclick = closeModal;
  });
}

// ─── Push notifications ───────────────────────────────────────────────────────

async function reloadNotifySection() {
  const container = document.getElementById('notify-section');
  if (!container) return;

  const [globalSettings, userSettings] = await Promise.all([
    api.get('/settings'),
    api.get('/user-settings'),
  ]);
  const vapidKey  = globalSettings['notify.vapid_public_key'];
  const daysAhead = userSettings['notify.maturity_days_ahead'] ?? 3;

  let status = 'unsupported';
  let endpoint = null;
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    status = Notification.permission === 'granted' ? 'maybe' : Notification.permission;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { status = 'subscribed'; endpoint = sub.endpoint; }
    } catch {}
  }
  if (!vapidKey && status !== 'subscribed') status = 'no_vapid';

  const badge = ({
    unsupported: '<span class="badge neg">Trình duyệt không hỗ trợ</span>',
    denied:      '<span class="badge neg">Đã bị chặn</span>',
    no_vapid:    '<span class="badge neg">Server chưa cấu hình</span>',
    default:     '<span class="badge">Chưa bật</span>',
    maybe:       '<span class="badge">Chưa đăng ký</span>',
    subscribed:  '<span class="badge pos">Đang bật</span>',
  })[status] || '';

  const actionBtn = status === 'subscribed'
    ? '<button type="button" id="btn-push-off" class="small">Tắt</button>'
    : (['unsupported', 'denied', 'no_vapid'].includes(status) ? ''
      : '<button type="button" id="btn-push-on" class="small">Bật thông báo</button>');

  container.innerHTML = `
    <div class="provider-row">
      <span>Trạng thái</span>
      <span>${badge}</span>
      ${actionBtn}
    </div>
    <div class="provider-row">
      <label for="notify-days">Nhắc trước (ngày)</label>
      <input type="number" id="notify-days" value="${escapeHtml(String(daysAhead))}" min="1" max="60" style="width:90px;" />
      <button type="button" id="btn-save-days" class="small">Lưu</button>
    </div>
    <div class="toolbar" style="margin-top:8px;">
      <button type="button" id="btn-push-test" class="small secondary"
        ${status === 'subscribed' ? '' : 'disabled'}>📨 Gửi thử</button>
    </div>
    ${status === 'no_vapid' ? '<p class="muted-sm">VAPID key chưa được cấu hình trên server. Liên hệ admin để bật tính năng.</p>' : ''}
  `;

  document.getElementById('btn-push-on') ?.addEventListener('click', () => subscribePush(vapidKey));
  document.getElementById('btn-push-off')?.addEventListener('click', () => unsubscribePush(endpoint));
  document.getElementById('btn-push-test')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-push-test');
    btn.disabled = true; btn.classList.add('btn-loading');
    try {
      const r = await api.post('/push/test', {});
      toast(`Đã gửi ${r.sent ?? 0} thông báo${r.failed ? `, ${r.failed} lỗi` : ''}`);
    } catch (err) {
      toast('Lỗi: ' + err.message);
    } finally {
      btn.disabled = false; btn.classList.remove('btn-loading');
    }
  });
  document.getElementById('btn-save-days').onclick = async () => {
    const v = Number(document.getElementById('notify-days').value) || 3;
    try {
      await api.post('/user-settings', { key: 'notify.maturity_days_ahead', value: v });
      toast('Đã lưu ngưỡng nhắc');
    } catch (err) {
      toast('Lỗi: ' + err.message);
    }
  };
}

async function subscribePush(vapidPublicKey) {
  if (!vapidPublicKey) { toast('Thiếu VAPID key trên server'); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Bạn đã từ chối thông báo'); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    const j = sub.toJSON();
    await api.post('/push/subscribe', {
      endpoint: j.endpoint,
      keys:     j.keys,
      label:    navigator.userAgent.slice(0, 120),
    });
    toast('Đã bật thông báo');
    await reloadNotifySection();
  } catch (err) {
    toast('Lỗi: ' + err.message);
  }
}

async function unsubscribePush(endpoint) {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    if (endpoint) {
      await api.del('/push/subscribe?endpoint=' + encodeURIComponent(endpoint));
    }
    toast('Đã tắt thông báo');
    await reloadNotifySection();
  } catch (err) {
    toast('Lỗi: ' + err.message);
  }
}

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
