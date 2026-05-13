import { api } from '../api.js';
import { escapeHtml, openModal, closeModal, toast, rerender } from '../main.js';

export async function renderMembers(view) {
  const members = await api.get('/members');

  view.innerHTML = `
    <div class="page-header">
      <h1>👥 Thành viên</h1>
      <button id="btn-new">+ Thêm thành viên</button>
    </div>

    <div class="section">
      ${members.length === 0 ? '<div class="empty">Chưa có thành viên</div>' : `
      <table>
        <thead>
          <tr><th>ID</th><th>Tên</th><th>Màu</th></tr>
        </thead>
        <tbody>
          ${members.map((m) => `
            <tr>
              <td>${m.id}</td>
              <td><span class="member-chip" style="background:${escapeHtml(m.color)}">${escapeHtml(m.name)}</span></td>
              <td><code>${escapeHtml(m.color)}</code></td>
            </tr>
          `).join('')}
        </tbody>
      </table>`}
    </div>
  `;

  document.getElementById('btn-new').onclick = () => openMemberModal();
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
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      try {
        await api.post('/members', body);
        toast('Đã thêm');
        closeModal();
        rerender();
      } catch (err) {
        toast('Lỗi: ' + err.message);
      }
    };
  });
}
