import { renderDashboard } from './pages/dashboard.js';
import { renderAssets } from './pages/assets.js';
import { renderAssetDeltas } from './pages/asset-deltas.js';
import { renderSnapshots } from './pages/snapshots.js';
import { renderSettings } from './pages/settings.js';
import { renderLogin } from './pages/login.js';

const routes = {
  dashboard: renderDashboard,
  assets: renderAssets,
  'asset-deltas': renderAssetDeltas,
  snapshots: renderSnapshots,
  settings: renderSettings,
};

const view = document.getElementById('view');

let currentUser = null;
export function getCurrentUser() { return currentUser; }

function currentRoute() {
  const hash = window.location.hash.replace(/^#\//, '').split('?')[0];
  return routes[hash] ? hash : 'dashboard';
}

async function router() {
  if (!currentUser) {
    renderLogin(view);
    return;
  }
  const route = currentRoute();
  document.querySelectorAll('.sidebar a, .bottom-nav-item').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === route);
  });
  closeNav();
  view.innerHTML = '<div class="loading">Đang tải...</div>';
  try {
    await routes[route](view);
  } catch (err) {
    view.innerHTML = `<div class="empty">Lỗi: ${escapeHtml(err.message)}</div>`;
  }
}

window.addEventListener('hashchange', router);

// Mobile nav toggle
const sidebar = document.getElementById('sidebar');
const navToggle = document.getElementById('nav-toggle');
const navBackdrop = document.getElementById('nav-backdrop');
const headerMenu = document.getElementById('header-menu');
const navButtons = [navToggle, headerMenu].filter(Boolean);
function openNav() {
  sidebar.classList.add('open');
  navBackdrop.hidden = false;
  requestAnimationFrame(() => navBackdrop.classList.add('show'));
  navButtons.forEach((b) => b.setAttribute('aria-expanded', 'true'));
  document.body.classList.add('nav-open');
}
function closeNav() {
  sidebar.classList.remove('open');
  navBackdrop.classList.remove('show');
  setTimeout(() => { navBackdrop.hidden = true; }, 200);
  navButtons.forEach((b) => b.setAttribute('aria-expanded', 'false'));
  document.body.classList.remove('nav-open');
}
function toggleNav() {
  if (sidebar.classList.contains('open')) closeNav(); else openNav();
}
navButtons.forEach((b) => b.addEventListener('click', toggleNav));
navBackdrop.addEventListener('click', closeNav);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');

      const promptUpdate = (worker) => {
        toast('Có phiên bản mới', {
          label: 'Tải lại',
          onClick: () => {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              window.location.reload();
            }, { once: true });
            worker.postMessage({ type: 'SKIP_WAITING' });
          },
        });
      };

      // SW already waiting from a previous load (and a controller is in charge).
      if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            promptUpdate(newWorker);
          }
        });
      });
    } catch {}
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Bootstrap: check session before rendering the app shell.
// ────────────────────────────────────────────────────────────────────────────

function setShellVisible(visible) {
  document.body.classList.toggle('auth-only', !visible);
}

function renderUserChip() {
  const el = document.getElementById('sidebar-user');
  if (!el || !currentUser) return;
  el.querySelector('.user-name').textContent = currentUser.name;
  el.querySelector('.user-email').textContent = currentUser.email;
  el.querySelector('#btn-logout').onclick = logout;
}

export async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {}
  // Purge all caches so the next user can't see stale per-user API responses.
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  currentUser = null;
  window.location.hash = '#/';
  window.location.reload();
}

async function bootstrap() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.ok) {
      currentUser = await res.json();
      setShellVisible(true);
      renderUserChip();
      router();
      return;
    }
  } catch {}
  setShellVisible(false);
  renderLogin(view);
}

bootstrap();

export function toast(msg, action) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('toast-interactive', !!action);
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      el.classList.remove('show');
      action.onClick();
    });
    el.appendChild(btn);
  }
  el.classList.add('show');
  clearTimeout(el._t);
  if (!action) el._t = setTimeout(() => el.classList.remove('show'), 2800);
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
  if (onMount) onMount(root.querySelector('.modal'));
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

export function rerender() {
  router();
}

// ────────────────────────────────────────────────────────────────────────────
// Money input helpers — used by inputs marked [data-money].
// Display uses Vietnamese thousand-separator '.'; storage is plain integer.
// ────────────────────────────────────────────────────────────────────────────

export function formatMoney(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return '';
  const stripped = digits.replace(/^0+(\d)/, '$1');
  return stripped.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function parseMoney(formatted) {
  if (formatted == null || formatted === '') return null;
  const n = Number(String(formatted).replace(/\./g, ''));
  return Number.isFinite(n) ? n : null;
}

// Attaches live-format + caret-preserving handlers to all [data-money] inputs
// within `root`. Safe to call multiple times — the marker class prevents
// double-binding when forms get re-rendered.
export function bindMoneyInputs(root) {
  root.querySelectorAll('input[data-money]').forEach((input) => {
    if (input.dataset.moneyBound === '1') return;
    input.dataset.moneyBound = '1';
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    if (input.value) input.value = formatMoney(input.value);

    input.addEventListener('input', () => {
      const before = input.selectionStart ?? input.value.length;
      const digitsBefore = input.value.slice(0, before).replace(/\./g, '').length;
      input.value = formatMoney(input.value);
      // Restore caret by counting digits.
      let pos = 0, seen = 0;
      while (pos < input.value.length && seen < digitsBefore) {
        if (input.value[pos] !== '.') seen += 1;
        pos += 1;
      }
      input.setSelectionRange(pos, pos);
    });
  });
}

// Convenience: parse `[data-money]` fields of a payload in-place.
export function parseMoneyPayload(payload, keys) {
  for (const k of keys) {
    if (payload[k] != null && payload[k] !== '') {
      payload[k] = parseMoney(payload[k]);
    }
  }
}
