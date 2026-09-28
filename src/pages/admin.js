import { api } from '../api.js';
import { escapeHtml, openModal, closeModal, toast } from '../main.js';

function inviteUrl(token) {
  return `${location.origin}/#/signup?invite=${encodeURIComponent(token)}`;
}

function fmtDate(s) {
  if (!s) return '—';
  // D1 datetime('now') is "YYYY-MM-DD HH:MM:SS" in UTC.
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return isNaN(d) ? s : d.toLocaleString('vi-VN');
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Đã sao chép link');
  } catch {
    window.prompt('Sao chép link:', text);
  }
}

export async function renderAdmin(view) {
  view.innerHTML = `
    <div class="page-header">
      <h1>🛡️ Quản trị</h1>
    </div>

    <div class="section">
      <h2>🔗 Link đăng ký</h2>
      <p class="muted-sm" style="margin: -8px 0 12px;">
        Mỗi link chỉ dùng được 1 lần và hết hạn sau 7 ngày.
      </p>
      <div class="modal-actions" style="margin-bottom:12px;">
        <button type="button" id="btn-new-invite">+ Tạo link đăng ký</button>
      </div>
      <div id="invite-list"></div>
    </div>

    <div class="section">
      <h2>👤 Tài khoản</h2>
      <div id="user-list"></div>
    </div>
  `;

  document.getElementById('btn-new-invite').onclick = onCreateInvite;
  await Promise.all([reloadInvites(), reloadUsers()]);
}

// ─── Invites ────────────────────────────────────────────────────────────────

async function onCreateInvite() {
  const btn = document.getElementById('btn-new-invite');
  btn.disabled = true;
  btn.classList.add('btn-loading');
  try {
    const inv = await api.post('/admin/invites', {});
    const url = inviteUrl(inv.token);
    openModal(`
      <h3>Link đăng ký</h3>
      <p class="muted-sm">Gửi link này cho người cần tạo tài khoản. Hết hạn: ${escapeHtml(fmtDate(inv.expires_at))}</p>
      <div class="form-grid">
        <label class="full">Link
          <input readonly value="${escapeHtml(url)}" id="invite-url" />
        </label>
        <div class="modal-actions full">
          <button type="button" class="secondary" id="cancel">Đóng</button>
          <button type="button" id="copy">Sao chép</button>
        </div>
      </div>
    `, (root) => {
      root.querySelector('#cancel').onclick = closeModal;
      root.querySelector('#copy').onclick = () => copy(url);
      root.querySelector('#invite-url').select();
    });
    await reloadInvites();
  } catch (err) {
    toast('Lỗi: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
  }
}

function inviteStatus(inv) {
  if (inv.used_at) return `<span class="badge pos">Đã dùng${inv.used_by_email ? ' · ' + escapeHtml(inv.used_by_email) : ''}</span>`;
  if (inv.expired) return '<span class="badge">Hết hạn</span>';
  return '<span class="badge warn">Chờ dùng</span>';
}

async function reloadInvites() {
  const invites = await api.get('/admin/invites');
  const list = document.getElementById('invite-list');
  if (!list) return;
  if (!invites.length) {
    list.innerHTML = '<div class="empty">Chưa có link nào</div>';
    return;
  }
  list.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Tạo lúc</th><th>Hết hạn</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>
        ${invites.map((inv) => {
          const pending = !inv.used_at && !inv.expired;
          return `
            <tr data-token="${escapeHtml(inv.token)}">
              <td>${escapeHtml(fmtDate(inv.created_at))}</td>
              <td>${escapeHtml(fmtDate(inv.expires_at))}</td>
              <td>${inviteStatus(inv)}</td>
              <td style="white-space:nowrap;">
                ${pending ? `
                  <button type="button" class="small secondary" data-act="copy">Sao chép</button>
                  <button type="button" class="small danger" data-act="revoke">Thu hồi</button>
                ` : ''}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table></div>
  `;
  list.querySelectorAll('tr[data-token]').forEach((tr) => {
    const token = tr.dataset.token;
    const copyBtn = tr.querySelector('[data-act="copy"]');
    const revokeBtn = tr.querySelector('[data-act="revoke"]');
    if (copyBtn) copyBtn.onclick = () => copy(inviteUrl(token));
    if (revokeBtn) revokeBtn.onclick = async () => {
      if (!confirm('Thu hồi link đăng ký này?')) return;
      revokeBtn.disabled = true;
      try {
        await api.del('/admin/invites/' + encodeURIComponent(token));
        await reloadInvites();
      } catch (err) {
        revokeBtn.disabled = false;
        toast('Lỗi: ' + err.message);
      }
    };
  });
}

// ─── Users ──────────────────────────────────────────────────────────────────

function userStatus(u) {
  if (u.is_super_admin) return '<span class="badge warn">Super admin</span>';
  if (u.disabled_at) return '<span class="badge neg">Đã vô hiệu hoá</span>';
  return '<span class="badge pos">Hoạt động</span>';
}

async function reloadUsers() {
  const users = await api.get('/admin/users');
  const list = document.getElementById('user-list');
  if (!list) return;
  list.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Tên</th><th>Email</th><th>Ngày tạo</th><th>Tài sản</th><th>Phiên</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>
        ${users.map((u) => `
          <tr data-id="${u.id}">
            <td>${escapeHtml(u.name)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td>${escapeHtml(fmtDate(u.created_at))}</td>
            <td>${u.assets}</td>
            <td>${u.sessions}</td>
            <td>${userStatus(u)}</td>
            <td style="white-space:nowrap;">
              ${u.is_super_admin ? '' : `
                <button type="button" class="small secondary" data-act="password">Đặt lại MK</button>
                <button type="button" class="small ${u.disabled_at ? 'secondary' : 'warn'}" data-act="toggle">
                  ${u.disabled_at ? 'Kích hoạt' : 'Vô hiệu hoá'}
                </button>
                <button type="button" class="small danger" data-act="delete">Xoá</button>
              `}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
  list.querySelectorAll('tr[data-id]').forEach((tr) => {
    const u = users.find((x) => x.id === Number(tr.dataset.id));
    if (u.is_super_admin) return;
    tr.querySelector('[data-act="password"]').onclick = () => openResetPasswordModal(u);
    tr.querySelector('[data-act="toggle"]').onclick = (e) => onToggleDisabled(u, e.currentTarget);
    tr.querySelector('[data-act="delete"]').onclick = (e) => onDelete(u, e.currentTarget);
  });
}

async function onToggleDisabled(u, btn) {
  const disable = !u.disabled_at;
  if (disable && !confirm(`Vô hiệu hoá ${u.email}? Người dùng sẽ bị đăng xuất khỏi mọi thiết bị.`)) return;
  btn.disabled = true;
  try {
    await api.put('/admin/users/' + u.id, { disabled: disable });
    toast(disable ? 'Đã vô hiệu hoá' : 'Đã kích hoạt');
    await reloadUsers();
  } catch (err) {
    btn.disabled = false;
    toast('Lỗi: ' + err.message);
  }
}

async function onDelete(u, btn) {
  const typed = window.prompt(
    `Xoá vĩnh viễn ${u.email} cùng toàn bộ dữ liệu (${u.assets} tài sản)?\nNhập email để xác nhận:`,
  );
  if (typed == null) return;
  if (typed.trim().toLowerCase() !== u.email.toLowerCase()) {
    toast('Email không khớp — đã huỷ');
    return;
  }
  btn.disabled = true;
  try {
    await api.del('/admin/users/' + u.id);
    toast('Đã xoá tài khoản');
    await reloadUsers();
  } catch (err) {
    btn.disabled = false;
    toast('Lỗi: ' + err.message);
  }
}

function openResetPasswordModal(u) {
  openModal(`
    <h3>Đặt lại mật khẩu</h3>
    <p class="muted-sm">${escapeHtml(u.email)} sẽ bị đăng xuất khỏi mọi thiết bị.</p>
    <form id="reset-form" class="form-grid">
      <label class="full">Mật khẩu mới (tối thiểu 8 ký tự)
        <input name="new_password" type="password" required minlength="8" autocomplete="new-password" />
      </label>
      <div class="modal-actions full">
        <button type="button" class="secondary" id="cancel">Huỷ</button>
        <button type="submit">Đặt lại</button>
      </div>
    </form>
  `, (root) => {
    root.querySelector('#cancel').onclick = closeModal;
    root.querySelector('#reset-form').onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.classList.add('btn-loading');
      try {
        await api.post(`/admin/users/${u.id}/password`, { new_password: e.target.new_password.value });
        toast('Đã đặt lại mật khẩu');
        closeModal();
        await reloadUsers();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn-loading');
        toast('Lỗi: ' + err.message);
      }
    };
  });
}
