import { renderDashboard } from './pages/dashboard.js';
import { renderAssets } from './pages/assets.js';
import { renderTransactions } from './pages/transactions.js';
import { renderMembers } from './pages/members.js';
import { renderGroups } from './pages/groups.js';
import { api } from './api.js';

const routes = {
  dashboard: renderDashboard,
  assets: renderAssets,
  transactions: renderTransactions,
  members: renderMembers,
  groups: renderGroups,
};

const view = document.getElementById('view');

function currentRoute() {
  const hash = window.location.hash.replace(/^#\//, '');
  return routes[hash] ? hash : 'dashboard';
}

async function router() {
  const route = currentRoute();
  document.querySelectorAll('.sidebar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === route);
  });
  view.innerHTML = '<div class="loading">Đang tải...</div>';
  try {
    await routes[route](view);
  } catch (err) {
    view.innerHTML = `<div class="empty">Lỗi: ${escapeHtml(err.message)}</div>`;
  }
}

window.addEventListener('hashchange', router);

// Init: seed if empty, then render
(async function init() {
  try {
    await api.post('/seed', {});
  } catch {
    // ignore — seed is idempotent and may fail if already populated
  }
  router();
})();

export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2800);
}

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function fmtVND(n) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫';
}

export function fmtNum(n, digits = 0) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(n);
}

export function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  const v = Number(n).toFixed(2);
  return (n >= 0 ? '+' : '') + v + '%';
}

export function openModal(html, onMount) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-overlay"><div class="modal">${html}</div></div>`;
  const overlay = root.querySelector('.modal-overlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  if (onMount) onMount(root.querySelector('.modal'));
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

export function rerender() {
  router();
}
