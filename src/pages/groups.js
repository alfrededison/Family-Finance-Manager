import { api } from '../api.js';
import { escapeHtml, openModal, closeModal, toast, rerender } from '../main.js';

export async function renderGroups(view) {
  const groups = await api.get('/groups');

  view.innerHTML = `
    <div class="page-header">
      <h1>📂 Nhóm tài sản</h1>
      <button id="btn-new">+ Thêm nhóm</button>
    </div>

    <div class="section">
      ${groups.length === 0 ? '<div class="empty">Chưa có nhóm</div>' : `
      <table>
        <thead>
          <tr><th>ID</th><th>Icon</th><th>Tên</th><th>Loại</th></tr>
        </thead>
        <tbody>
          ${groups.map((g) => `
            <tr>
              <td>${g.id}</td>
              <td style="font-size:20px;">${escapeHtml(g.icon)}</td>
              <td><strong>${escapeHtml(g.name)}</strong></td>
              <td><span class="badge">${g.type === 'Liability' ? 'Nợ' : 'Tài sản'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>`}
    </div>
  `;

  document.getElementById('btn-new').onclick = () => openGroupModal();
}

function openGroupModal() {
  openModal(`
    <h3>Thêm nhóm</h3>
    <form id="group-form" class="form-grid">
      <label>Tên
        <input name="name" required />
      </label>
      <label>Icon (emoji)
        <input name="icon" placeholder="📦" maxlength="4" />
      </label>
      <label class="full">Loại
        <select name="type">
          <option value="Asset">Tài sản</option>
          <option value="Liability">Nợ phải trả</option>
        </select>
      </label>
      <div class="modal-actions full">
        <button type="button" class="secondary" id="cancel">Huỷ</button>
        <button type="submit">Tạo</button>
      </div>
    </form>
  `, (root) => {
    root.querySelector('#cancel').onclick = closeModal;
    root.querySelector('#group-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      try {
        await api.post('/groups', body);
        toast('Đã thêm');
        closeModal();
        rerender();
      } catch (err) {
        toast('Lỗi: ' + err.message);
      }
    };
  });
}
