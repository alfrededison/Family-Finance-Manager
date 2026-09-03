// Build a notification summary for one user: assets approaching maturity,
// plus loans with periodic interest payments coming due.
//
// Returns { count, title, body, url }. count=0 → caller may skip sending.

import { nextInterestPaymentDate } from './_utils.js';

const SUBTYPE_LABELS = {
  'trai-phieu':      'trái phiếu',
  'cho-vay-nong':    'cho vay nóng',
  'cho-vay-lau-dai': 'cho vay dài hạn',
  'tra-gop':         'trả góp',
  'vay-nong':        'vay nóng',
  'vay-lau-dai':     'vay dài hạn',
  'tg-co-dinh':      'tiền gửi cố định',
  'tg-linh-hoat':    'tiền gửi linh hoạt',
  'so-tiet-kiem':    'sổ tiết kiệm',
};

export async function buildNotificationSummary(env, userId, now = new Date()) {
  // Per-user threshold (days). Default 3.
  const row = await env.DB.prepare(
    "SELECT value FROM user_settings WHERE user_id = ? AND key = 'notify.maturity_days_ahead'",
  ).bind(userId).first();
  let days = 3;
  if (row?.value) {
    try { days = Number(JSON.parse(row.value)) || 3; } catch {}
  }

  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);

  // 1) Overdue: active assets whose maturity_date is in the past.
  //    No lower bound — user must explicitly close/process to stop nagging.
  const { results: overdue = [] } = await env.DB.prepare(`
    SELECT id, name, subtype, group_id, maturity_date
    FROM assets
    WHERE user_id = ? AND status = 'active'
      AND maturity_date IS NOT NULL AND maturity_date <> ''
      AND date(maturity_date) < date(?)
    ORDER BY maturity_date ASC
  `).bind(userId, today).all();

  // 2) Maturity within window.
  const { results: maturing = [] } = await env.DB.prepare(`
    SELECT id, name, subtype, group_id, maturity_date
    FROM assets
    WHERE user_id = ? AND status = 'active'
      AND maturity_date IS NOT NULL AND maturity_date <> ''
      AND date(maturity_date) BETWEEN date(?) AND date(?)
    ORDER BY maturity_date ASC
  `).bind(userId, today, horizon).all();

  // 3) Loans with periodic interest payment due within window.
  //    end_of_term is excluded — that case is handled by the maturity branch.
  const { results: loans = [] } = await env.DB.prepare(`
    SELECT id, name, subtype, group_id, start_date, maturity_date,
           interest_payment_day, interest_payment_cycle
    FROM assets
    WHERE user_id = ? AND status = 'active'
      AND group_id IN ('cho-vay', 'di-vay')
      AND interest_payment_day IS NOT NULL
      AND interest_payment_cycle IN ('monthly', 'quarterly')
  `).bind(userId).all();

  const receiveSoon = []; // cho-vay (nhận lãi)
  const paySoon     = []; // di-vay (trả lãi)
  const receiveToday = [];
  const payToday     = [];
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  for (const a of loans) {
    const next = nextInterestPaymentDate(a, now);
    if (!next) continue;
    const daysOut = Math.round((new Date(next) - todayUTC) / 86400000);
    if (daysOut < 0 || daysOut > days) continue;
    const isReceive = a.group_id === 'cho-vay';
    if (daysOut === 0) (isReceive ? receiveToday : payToday).push(a);
    else               (isReceive ? receiveSoon  : paySoon).push(a);
  }

  // Today's maturity events get listed by name; future ones are aggregated.
  const maturingToday  = maturing.filter((r) => (r.maturity_date || '').slice(0, 10) === today);
  const maturingFuture = maturing.filter((r) => (r.maturity_date || '').slice(0, 10) !== today);

  const count = overdue.length + maturing.length + receiveSoon.length + paySoon.length
              + receiveToday.length + payToday.length;
  if (count === 0) return { count: 0, title: null, body: null, url: '/#/assets' };

  const groupBy = (rows, keyFn) => {
    const g = {};
    for (const r of rows) (g[keyFn(r)] ||= []).push(r);
    return g;
  };
  const subtypeLabel = (k) => SUBTYPE_LABELS[k] || k;
  const loanLabel    = (k) => k === 'cho-vay' ? 'khoản cho vay' : 'khoản đi vay';
  const names        = (rows) => rows.map((r) => r.name).join(', ');

  // Today's events are itemized by name; everything else is grouped by type
  // with counts so the notification stays scannable.
  const lines = [];
  for (const [k, l] of Object.entries(groupBy(overdue, (r) => r.subtype || r.group_id))) {
    lines.push(`🚨 Quá hạn: ${l.length} ${subtypeLabel(k)}`);
  }
  if (maturingToday.length)  lines.push(`⏰ Đáo hạn hôm nay: ${names(maturingToday)}`);
  if (receiveToday.length)   lines.push(`💰 Nhận lãi hôm nay: ${names(receiveToday)}`);
  if (payToday.length)       lines.push(`💸 Trả lãi hôm nay: ${names(payToday)}`);
  for (const [k, l] of Object.entries(groupBy(maturingFuture, (r) => r.subtype || r.group_id))) {
    lines.push(`⏰ Đáo hạn ≤${days}d: ${l.length} ${subtypeLabel(k)}`);
  }
  if (receiveSoon.length) lines.push(`💰 Nhận lãi ≤${days}d: ${receiveSoon.length} ${loanLabel('cho-vay')}`);
  if (paySoon.length)     lines.push(`💸 Trả lãi ≤${days}d: ${paySoon.length} ${loanLabel('di-vay')}`);

  const titleEmoji = overdue.length ? '🚨' : '💰';
  return {
    count,
    title: `${titleEmoji} ${count} nhắc nhở tài chính`,
    body:  lines.join('\n'),
    url:   '/#/assets',
  };
}
