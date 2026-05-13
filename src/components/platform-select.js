import { escapeHtml } from '../main.js';

// Dropdown of user-managed platforms (Tiền gửi). `platforms` from /api/platforms.
export function platformSelectHTML(name, selected, platforms) {
  return `
    <select name="${name}" required>
      <option value="">— Chọn nền tảng —</option>
      ${platforms.map((p) => `
        <option value="${escapeHtml(p.name)}" ${p.name === selected ? 'selected' : ''}>${escapeHtml(p.name)}</option>
      `).join('')}
    </select>
  `;
}
