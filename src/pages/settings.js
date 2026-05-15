import { api } from '../api.js';
import { escapeHtml, toast, rerender, fmtVND, openModal, closeModal } from '../main.js';

const MARKET_SUBTYPE_LABELS = {
  vang:      'Vàng',
  usd:       'USD',
  'co-phieu': 'Cổ phiếu',
};

export async function renderSettings(view) {
  view.innerHTML = `
    <div class="page-header"><h1>⚙️ Cài đặt</h1></div>

    <div class="section">
      <h2>👥 Thành viên</h2>
      <p class="muted-sm" style="margin: -8px 0 12px;">Quản lý thành viên dùng để gắn tài sản.</p>
      <div id="member-list"></div>
      <div class="toolbar" style="margin-top:12px;">
        <button type="button" id="btn-new-member">+ Thêm thành viên</button>
      </div>
    </div>

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

    <div class="section">
      <h2>Ứng dụng</h2>
      <p class="muted-sm" style="margin: -8px 0 12px;">Kiểm tra và áp dụng phiên bản mới nhất của ứng dụng.</p>
      <div class="toolbar">
        <button type="button" id="btn-force-reload">↺ Tải phiên bản mới nhất</button>
      </div>
    </div>
  `;

  await reloadMembers();
  await reloadPlatforms();
  await reloadMarketSettings();

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
      toast(`Đã cập nhật giá — ${res.assetsUpdated ?? 0} tài sản`);
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
