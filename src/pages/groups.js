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
      <div class="group-cards">
        ${groups.map((g) => `
          <div class="group-card" data-id="${escapeHtml(g.id)}">
            <div class="group-card-head">
              <div>
                <span style="font-size:20px;">${escapeHtml(g.icon)}</span>
                <strong>${escapeHtml(g.name)}</strong>
                <span class="badge">${g.type === 'Liability' ? 'Nợ' : 'Tài sản'}</span>
              </div>
              <code class="muted-sm">${escapeHtml(g.id)}</code>
            </div>
            <div class="chip-list" data-subtypes>
              ${(g.subtypes || []).map((s) => `
                <span class="chip" data-sub-id="${s.id}">
                  ${escapeHtml(s.name)}
                  <button type="button" class="chip-x" aria-label="Xoá">✕</button>
                </span>
              `).join('')}
            </div>
            <form class="toolbar add-subtype" style="margin-top:8px;">
              <input placeholder="+ Thêm phân loại" required style="flex:1; min-width:160px;" />
              <button type="submit" class="small">Thêm</button>
            </form>
          </div>
        `).join('')}
      </div>`}
    </div>
  `;

  document.getElementById('btn-new').onclick = () => openGroupModal();

  document.querySelectorAll('.group-card').forEach((card) => {
    const groupId = card.dataset.id;

    card.querySelectorAll('.chip').forEach((chip) => {
      const subId = Number(chip.dataset.subId);
      chip.querySelector('.chip-x').onclick = async () => {
        if (!confirm('Xoá phân loại này?')) return;
        try {
          await api.del(`/groups/${encodeURIComponent(groupId)}/subtypes?subId=${subId}`);
          rerender();
        } catch (err) {
          toast('Lỗi: ' + err.message);
        }
      };
    });

    card.querySelector('.add-subtype').onsubmit = async (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      const name = input.value.trim();
      if (!name) return;
      try {
        await api.post(`/groups/${encodeURIComponent(groupId)}/subtypes`, { name });
        input.value = '';
        rerender();
      } catch (err) {
        toast('Lỗi: ' + err.message);
      }
    };
  });
}

function openGroupModal() {
  openModal(`
    <h3>Thêm nhóm</h3>
    <form id="group-form" class="form-grid">
      <label class="full">Tên
        <input name="name" required placeholder="VD: Quỹ dự phòng" />
      </label>
      <label>Icon (emoji)
        <input name="icon" placeholder="📦" maxlength="4" />
      </label>
      <label>Loại
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
