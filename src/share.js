// Share assets / asset groups as a PNG image.
//
// Cards are drawn directly onto a <canvas> (no DOM screenshot, no dependencies)
// so the output is crisp, consistent and works offline. Delivery prefers the
// native share sheet (navigator.share with a file — mostly mobile) and falls
// back to downloading the PNG on desktop / unsupported browsers.

import { fmtVND, fmtPct, toast } from './main.js';
import { isLiquid, nextInterestPaymentDate } from './data/groups.js';
import { formatBank } from './data/banks.js';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";

// Palette mirrors the CSS custom properties in style.css.
const C = {
  bg:      '#f8fafc',
  surface: '#ffffff',
  border:  '#e2e8f0',
  text:    '#0f172a',
  muted:   '#64748b',
  primary: '#3b82f6',
  success: '#10b981',
  danger:  '#ef4444',
};

// Share-node icon markup, injected into buttons in the asset list.
export const SHARE_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>`;

// ── Canvas helpers ────────────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Wrap `text` to `maxWidth`, at most `maxLines` lines (last line ellipsised).
function wrapText(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  // Anything left over gets folded into an ellipsised final line.
  const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (consumed < words.length) {
    let last = lines.pop() || '';
    while (ctx.measureText(last + '…').width > maxWidth && last.length) {
      last = last.slice(0, -1);
    }
    lines.push(last + '…');
  }
  return lines.length ? lines : [''];
}

function truncate(ctx, text, maxWidth) {
  let s = String(text ?? '');
  if (ctx.measureText(s).width <= maxWidth) return s;
  while (s.length && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

function todayLabel() {
  return new Intl.DateTimeFormat('vi-VN').format(new Date());
}

function newCanvas(w, h) {
  const dpr = Math.max(2, Math.round(window.devicePixelRatio || 1));
  const canvas = document.createElement('canvas');
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { canvas, ctx };
}

// Card frame shared by both card types: background + rounded surface + brand row.
function drawFrame(ctx, w, h, pad) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = C.surface;
  roundRect(ctx, 16, 16, w - 32, h - 32, 16);
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 15px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'left';
  ctx.fillText('💼 Quản lý tài sản', pad, pad + 15);
  ctx.textAlign = 'right';
  ctx.fillText(todayLabel(), w - pad, pad + 15);
  ctx.textAlign = 'left';
}

// ── Single asset card ───────────────────────────────────────────────────────

const PAD = 40;
const W = 700;
const BRAND_H = 40;
const CHIP_H = 34;
const NAME_LINE_H = 40;
const NAME_GAP = 6;
const META_H = 26;
const DIVIDER_H = 30;
const ROW_H = 46;
const ROWS_GAP = 10;
const BADGE_H = 40;

// Strip the internal `__src:provider:id|` prefix off auto-synced notes.
function stripSrcPrefix(notes) {
  if (!notes) return null;
  const m = notes.match(/^__src:([^:]+):[^|]+\|(.+)$/);
  return m ? `${m[2]} (${m[1].toUpperCase()})` : notes;
}

function assetRows(a) {
  const rows = [{ label: 'Giá trị', value: fmtVND(a.value), big: true }];
  if (a.cost != null && a.cost !== a.value) {
    rows.push({ label: 'Vốn', value: fmtVND(a.cost) });
  }
  if (a.pnl != null) {
    const pct = a.pnlPct != null ? ` (${fmtPct(a.pnlPct)})` : '';
    rows.push({ label: 'Lãi / Lỗ', value: fmtVND(a.pnl) + pct, color: a.pnl >= 0 ? C.success : C.danger });
  }
  const hideQty = ['bank', 'tien-gui', 'cho-vay', 'di-vay'].includes(a.group_id);
  if (!hideQty && a.qty) rows.push({ label: 'Số lượng', value: `${a.qty} ${a.unit || ''}`.trim() });

  // Detail rows — mirror the mobile row's sub-info line.
  if (a.group_id === 'bank' && a.bank) rows.push({ label: 'Ngân hàng', value: formatBank(a.bank) });
  if (a.group_id === 'tien-gui' && a.platform) rows.push({ label: 'Nền tảng', value: a.platform });
  if (a.interest_rate != null && a.interest_rate !== '') rows.push({ label: 'Lãi suất', value: `${a.interest_rate}%/năm` });
  if (a.term) rows.push({ label: 'Kỳ hạn', value: `${a.term} tháng` });
  if (a.maturity_date) rows.push({ label: 'Đáo hạn', value: a.maturity_date });
  const nextPay = nextInterestPaymentDate(a);
  if (nextPay) rows.push({ label: 'Trả lãi tiếp theo', value: nextPay });
  if (a.group_id === 'bank') {
    if (a.notes) rows.push({ label: 'Số tài khoản', value: a.notes });
  } else {
    const notes = stripSrcPrefix(a.notes);
    if (notes) rows.push({ label: 'Ghi chú', value: notes });
  }

  return rows;
}

function renderAssetCard(a) {
  const innerW = W - PAD * 2;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `700 30px ${FONT}`;
  const nameLines = wrapText(measure, a.name, innerW, 2);
  const rows = assetRows(a);
  const meta = [a.group_icon, a.group_name].filter(Boolean).join(' ') +
    (a.subtype_name ? ` · ${a.subtype_name}` : '');

  const h = PAD + BRAND_H + (a.member_id ? CHIP_H : 0) +
    nameLines.length * NAME_LINE_H + NAME_GAP + (meta ? META_H : 0) +
    DIVIDER_H + rows.length * ROW_H + ROWS_GAP + BADGE_H + PAD;

  const { canvas, ctx } = newCanvas(W, h);
  drawFrame(ctx, W, h, PAD);

  let y = PAD + BRAND_H;

  if (a.member_id) {
    ctx.font = `600 14px ${FONT}`;
    const label = a.member_name || '';
    const w = ctx.measureText(label).width + 24;
    ctx.fillStyle = a.member_color || C.primary;
    roundRect(ctx, PAD, y, w, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, PAD + 12, y + 17);
    y += CHIP_H;
  }

  ctx.fillStyle = C.text;
  ctx.font = `700 30px ${FONT}`;
  for (const line of nameLines) {
    y += 32;
    ctx.fillText(line, PAD, y);
    y += NAME_LINE_H - 32;
  }
  y += NAME_GAP;

  if (meta) {
    ctx.fillStyle = C.muted;
    ctx.font = `400 16px ${FONT}`;
    ctx.fillText(meta, PAD, y + 16);
    y += META_H;
  }

  // Divider
  y += 14;
  ctx.strokeStyle = C.border;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  y += DIVIDER_H - 14;

  for (const row of rows) {
    ctx.fillStyle = C.muted;
    ctx.font = `400 16px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(row.label, PAD, y + 26);
    const labelW = ctx.measureText(row.label).width;

    ctx.fillStyle = row.color || C.text;
    ctx.font = `${row.big ? 700 : 600} ${row.big ? 22 : 18}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(truncate(ctx, row.value, innerW - labelW - 24), W - PAD, y + 26);
    y += ROW_H;
  }
  ctx.textAlign = 'left';
  y += ROWS_GAP;

  // Liquidity badge
  const liquid = isLiquid(a);
  const badgeText = liquid ? 'Khả dụng' : 'Chưa khả dụng';
  ctx.font = `600 14px ${FONT}`;
  const bw = ctx.measureText(badgeText).width + 24;
  ctx.fillStyle = liquid ? '#ecfdf5' : '#fffbeb';
  roundRect(ctx, PAD, y, bw, 28, 14);
  ctx.fill();
  ctx.fillStyle = liquid ? '#065f46' : '#92400e';
  ctx.fillText(badgeText, PAD + 12, y + 19);

  return canvas;
}

// ── Group card ────────────────────────────────────────────────────────────────

const GTITLE_H = 46;
const ITEM_H = 54;
const SUBTOTAL_H = 62;
const MAX_ITEMS = 25;

function renderGroupCard(group, items) {
  const innerW = W - PAD * 2;
  const valueColW = 260;
  const nameColW = innerW - valueColW - 16;

  const shown = items.slice(0, MAX_ITEMS);
  const hiddenCount = items.length - shown.length;
  const extraRow = hiddenCount > 0 ? 1 : 0;

  const h = PAD + BRAND_H + GTITLE_H + DIVIDER_H +
    (shown.length + extraRow) * ITEM_H + SUBTOTAL_H + PAD;

  const { canvas, ctx } = newCanvas(W, h);
  drawFrame(ctx, W, h, PAD);

  let y = PAD + BRAND_H;

  // Group title
  ctx.fillStyle = C.text;
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText(`${group.icon} ${group.name}`, PAD, y + 24);
  ctx.fillStyle = C.muted;
  ctx.font = `400 16px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${items.length} tài sản`, W - PAD, y + 24);
  ctx.textAlign = 'left';
  y += GTITLE_H;

  // Divider
  y += 14;
  ctx.strokeStyle = C.border;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  y += DIVIDER_H - 14;

  for (const a of shown) {
    ctx.fillStyle = C.text;
    ctx.font = `600 17px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(truncate(ctx, a.name, nameColW), PAD, y + 22);

    if (a.subtype_name) {
      ctx.fillStyle = C.muted;
      ctx.font = `400 13px ${FONT}`;
      ctx.fillText(truncate(ctx, a.subtype_name, nameColW), PAD, y + 42);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = C.text;
    ctx.font = `600 17px ${FONT}`;
    ctx.fillText(fmtVND(a.value), W - PAD, y + 22);

    if (a.pnl != null) {
      ctx.fillStyle = a.pnl >= 0 ? C.success : C.danger;
      ctx.font = `400 13px ${FONT}`;
      const pct = a.pnlPct != null ? ` (${fmtPct(a.pnlPct)})` : '';
      ctx.fillText(fmtVND(a.pnl) + pct, W - PAD, y + 42);
    }
    ctx.textAlign = 'left';

    // Row separator
    ctx.strokeStyle = C.border;
    ctx.beginPath();
    ctx.moveTo(PAD, y + ITEM_H - 6);
    ctx.lineTo(W - PAD, y + ITEM_H - 6);
    ctx.stroke();
    y += ITEM_H;
  }

  if (extraRow) {
    ctx.fillStyle = C.muted;
    ctx.font = `400 15px ${FONT}`;
    ctx.fillText(`+ ${hiddenCount} tài sản khác`, PAD, y + 26);
    y += ITEM_H;
  }

  // Subtotal
  const subtotal = items.reduce((s, a) => s + (a.value ?? 0), 0);
  const subtotalPnl = items.reduce((s, a) => s + (a.pnl ?? 0), 0);
  y += 8;
  ctx.fillStyle = C.bg;
  roundRect(ctx, PAD, y, innerW, 44, 10);
  ctx.fill();
  ctx.fillStyle = C.text;
  ctx.font = `700 17px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('Tổng', PAD + 14, y + 29);
  ctx.textAlign = 'right';
  ctx.fillText(fmtVND(subtotal), W - PAD - 14, y + 20);
  ctx.fillStyle = subtotalPnl >= 0 ? C.success : C.danger;
  ctx.font = `400 14px ${FONT}`;
  ctx.fillText((subtotalPnl >= 0 ? '+' : '') + fmtVND(subtotalPnl), W - PAD - 14, y + 38);
  ctx.textAlign = 'left';

  return canvas;
}

// ── Delivery ────────────────────────────────────────────────────────────────

async function deliver(canvas, filename, title) {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) { toast('Không tạo được ảnh'); return; }

  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // user dismissed the share sheet
      // otherwise fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Đã tải ảnh xuống');
}

function slug(s) {
  return String(s || 'tai-san').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'tai-san';
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function shareAsset(asset) {
  const canvas = renderAssetCard(asset);
  await deliver(canvas, `${slug(asset.name)}.png`, asset.name);
}

export async function shareGroup(group, items) {
  if (!items.length) return;
  const canvas = renderGroupCard(group, items);
  await deliver(canvas, `${slug(group.name)}.png`, group.name);
}
