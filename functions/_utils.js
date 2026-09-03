export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

export const error = (message, status = 400) =>
  new Response(message, { status });

export async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function nowISO() {
  return new Date().toISOString();
}

// ─── Asset deltas ─────────────────────────────────────────────────────────────
// Fields whose changes are recorded in asset_deltas.
export const DELTA_FIELDS = [
  'name', 'qty', 'unit', 'cost_price', 'current_price',
  'member_id', 'platform', 'bank', 'term', 'maturity_date',
  'interest_rate', 'interest_tax_rate',
  'interest_payment_day', 'interest_payment_cycle',
  'interest_include_maturity',
  'start_date', 'ticker', 'subtype', 'group_id', 'notes',
];

// Normalize for comparison: null/undefined/'' → null; numeric → Number; else String.
function normVal(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
  return String(v);
}

// Return [{field, old, new}] for fields that actually changed.
// Only considers fields present in `after` (i.e. part of this update).
export function diffAssetFields(before, after, fields = DELTA_FIELDS) {
  const changes = [];
  for (const f of fields) {
    if (!(f in after)) continue;
    if (normVal(before?.[f]) !== normVal(after[f])) {
      changes.push({ field: f, old: before?.[f] ?? null, new: after[f] ?? null });
    }
  }
  return changes;
}

// Snapshot for 'create': fields with a value → {field, old:null, new:value}.
export function snapshotAssetFields(asset, fields = DELTA_FIELDS) {
  const changes = [];
  for (const f of fields) {
    if (normVal(asset[f]) != null) {
      changes.push({ field: f, old: null, new: asset[f] });
    }
  }
  return changes;
}

// Insert one delta row. Skips 'edit' rows with no changes (no-op updates).
export async function recordAssetDelta(env, { assetId, type, changes, source = 'manual', note = null, now = nowISO() }) {
  if (type === 'edit' && (!changes || changes.length === 0)) return;
  await env.DB.prepare(
    'INSERT INTO asset_deltas (asset_id, type, changes, recorded_at, source, note) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(assetId, type, changes ? JSON.stringify(changes) : null, now, source, note).run();
}

// ── Interest date helpers (UTC-midnight Dates so day counts are exact on both
//    the CF backend and the browser) ─────────────────────────────────────────

function parseISODate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
function utcToday(now = new Date()) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}
// Clamp day-of-month to the actual last day of the given month.
function utcDayInMonth(year, month, day) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, last)));
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// { step, day, anchorMod } for monthly/quarterly cycles with a valid payment
// day, else null. Quarterly aligns to start_date's month (mod 3).
function paymentCycleConfig(a) {
  const cycle = a.interest_payment_cycle;
  if (cycle !== 'monthly' && cycle !== 'quarterly') return null;
  const day = Number(a.interest_payment_day);
  if (!day || day < 1 || day > 31) return null;
  const step = cycle === 'monthly' ? 1 : 3;
  let anchorMod = 0;
  if (step === 3) {
    const s = parseISODate(a.start_date);
    if (s) anchorMod = s.getUTCMonth() % 3;
  }
  return { step, day, anchorMod };
}

// Next upcoming interest payment date (YYYY-MM-DD) for monthly/quarterly
// cycles, or null. Today counts as upcoming. Dates on/before start_date and
// after maturity_date are never payment dates.
export function nextInterestPaymentDate(a, now = new Date()) {
  const cfg = paymentCycleConfig(a);
  if (!cfg) return null;
  const today = utcToday(now);
  const start = parseISODate(a.start_date);
  const mat = parseISODate(a.maturity_date);
  // Probe from whichever is later so a far-future start_date can't exhaust
  // the 24-month window.
  const base = start && start > today ? start : today;

  for (let i = 0; i < 24; i++) {
    const m = base.getUTCMonth() + i;
    if (m % cfg.step !== cfg.anchorMod) continue;
    const d = utcDayInMonth(base.getUTCFullYear(), m, cfg.day);
    if (d < base) continue;
    if (start && d <= start) continue;
    if (mat && d > mat) return null;
    return isoDate(d);
  }
  return null;
}

// The interest period that ends at the next payment: { from, to, days }, or
// null when the cycle has no payment day or the asset has matured.
// `from` = previous payment date (or start_date for the first cycle).
// When no payment day remains before maturity, the final stub period ends at
// maturity (counting the maturity day too when interest_include_maturity is
// set) — so the sum of all periods equals termYears().
export function nextInterestPeriod(a, now = new Date()) {
  const cfg = paymentCycleConfig(a);
  if (!cfg) return null;
  const today = utcToday(now);
  const start = parseISODate(a.start_date);
  const mat = parseISODate(a.maturity_date);

  let to = parseISODate(nextInterestPaymentDate(a, now));
  let extraDay = 0;
  if (!to) {
    if (!mat || mat < today) return null;
    to = mat;
    extraDay = a.interest_include_maturity ? 1 : 0;
  }

  // Latest aligned payment date strictly before `to`.
  let from = null;
  for (let i = 0; i <= cfg.step && !from; i++) {
    const m = to.getUTCMonth() - i;
    if (((m % cfg.step) + cfg.step) % cfg.step !== cfg.anchorMod) continue;
    const d = utcDayInMonth(to.getUTCFullYear(), m, cfg.day);
    if (d < to) from = d;
  }
  if (start && (!from || from < start)) from = start;
  if (!from || from >= to) return null;
  return { from: isoDate(from), to: isoDate(to), days: Math.round((to - from) / 86400000) + extraDay };
}

// Years from start_date to maturity_date, or null when either is missing /
// invalid / not increasing. Day count = maturity − start; +1 when the asset
// opts in to also counting the maturity day (some banks do).
function termYears(a) {
  const start = parseISODate(a.start_date);
  const mat = parseISODate(a.maturity_date);
  if (!start || !mat || mat <= start) return null;
  const extraDay = a.interest_include_maturity ? 1 : 0;
  return ((mat - start) / 86400000 + extraDay) / 365;
}

// Interest = principal × (rate/100) × years × (1 − tax).
// Years chosen by cycle rules:
//   - has maturity + end_of_term: full period (start → maturity)
//   - monthly/quarterly with a payment day: actual days of the upcoming
//     period (previous payment or start → next payment / maturity), per the
//     bank convention of actual-days/365
//   - monthly/quarterly without a payment day: 1/12 or 1/4 year, capped by
//     remaining-to-maturity
//   - no maturity + end_of_term: falls back to monthly (no period defined)
// NULL cycle ≡ end_of_term when has maturity, else monthly.
function pickInterestYears(a) {
  const cycle = a.interest_payment_cycle
    || (a.maturity_date ? 'end_of_term' : 'monthly');

  if (cycle === 'end_of_term' && a.start_date && a.maturity_date) {
    return termYears(a) ?? 0;
  }

  const period = nextInterestPeriod(a);
  if (period) return period.days / 365;

  const cycleYears = cycle === 'quarterly' ? 0.25 : 1 / 12;

  if (a.maturity_date) {
    const mat = new Date(a.maturity_date);
    if (!isNaN(mat.getTime())) {
      const remain = (mat - Date.now()) / 86400000 / 365;
      if (remain <= 0) return 0;
      return Math.min(cycleYears, remain);
    }
  }
  return cycleYears;
}

// Interest over the whole term (start → maturity) regardless of payout cycle.
// Same base and tax rules as the per-period functions below. null when the
// term is undefined or the group doesn't earn interest.
export function computeTermInterest(a) {
  if (a.interest_rate == null) return null;
  const years = termYears(a);
  if (years == null) return null;
  if (a.group_id === 'bank' || a.group_id === 'tien-gui') {
    const principal = a.group_id === 'bank' ? (a.current_price || 0) : (a.cost_price || 0);
    const taxRate = a.interest_tax_rate != null ? a.interest_tax_rate / 100 : 0;
    return principal * (a.interest_rate / 100) * years * (1 - taxRate);
  }
  if (a.group_id === 'cho-vay' || a.group_id === 'di-vay') {
    const remaining = a.current_price || 0;
    if (remaining <= 0) return null;
    return remaining * (a.interest_rate / 100) * years;
  }
  return null;
}

// PnL for bank / tiền gửi (savings accrual, with tax).
export function computeAccrualPnl(a) {
  if (a.group_id !== 'bank' && a.group_id !== 'tien-gui') return 0;
  if (a.interest_rate == null || !a.start_date) return 0;

  const years = pickInterestYears(a);
  if (years <= 0) return 0;

  const principal = a.group_id === 'bank' ? (a.current_price || 0) : (a.cost_price || 0);
  const taxRate = a.interest_tax_rate != null ? a.interest_tax_rate / 100 : 0;
  return principal * (a.interest_rate / 100) * years * (1 - taxRate);
}

// Forward-looking interest for cho-vay / đi-vay (no tax).
// Interest accrues on the remaining balance (current_price), not the original
// principal (cost_price). Returns null when inputs are insufficient.
export function computeLoanInterest(a) {
  if (a.interest_rate == null) return null;
  const remaining = a.current_price || 0;
  if (remaining <= 0) return null;

  const years = pickInterestYears(a);
  if (years <= 0) return 0;
  return remaining * (a.interest_rate / 100) * years;
}

// Returns { value, cost, pnl, pnlPct[, termPnl] } for an asset row.
// termPnl (interest groups only) = interest over the whole start → maturity term.
// - Bank / tiền gửi & cho vay / đi vay: forward-looking interest per pickInterestYears().
//   For loans pnl = +interest (cho-vay) or −interest (đi-vay).
//   End-of-term loans accrue interest into the balance like a deposit (cost stays
//   at the principal, value = principal + interest). Periodic-payout cycles keep
//   value at the remaining balance, so cost equals value and the dashboard's
//   value-cost rollup isn't polluted by remaining-balance changes.
// - Everything else: qty × price diff.
export function computeAssetMetrics(a) {
  if (a.group_id === 'bank' || a.group_id === 'tien-gui') {
    const principal = a.group_id === 'bank' ? (a.current_price || 0) : (a.cost_price || 0);
    const pnl = computeAccrualPnl(a);
    const cost = principal;
    const value = principal + pnl;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    return { value, cost, pnl, pnlPct, termPnl: computeTermInterest(a) };
  }
  if (a.group_id === 'cho-vay' || a.group_id === 'di-vay') {
    const remaining = (a.qty || 0) * (a.current_price || 0);
    const interest = computeLoanInterest(a);
    const pnl = interest == null ? null : (a.group_id === 'di-vay' ? -interest : interest);
    const pnlPct = pnl != null && remaining > 0 ? (pnl / remaining) * 100 : null;
    const endOfTerm = !a.interest_payment_cycle || a.interest_payment_cycle === 'end_of_term';
    const termInterest = computeTermInterest(a);
    const termPnl = termInterest == null ? null : (a.group_id === 'di-vay' ? -termInterest : termInterest);
    if (endOfTerm && interest != null) {
      return { value: remaining + interest, cost: remaining, pnl, pnlPct, termPnl };
    }
    return { value: remaining, cost: remaining, pnl, pnlPct, termPnl };
  }
  const value = (a.qty || 0) * (a.current_price || 0);
  const cost = (a.qty || 0) * (a.cost_price || 0);
  const pnl = value - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  return { value, cost, pnl, pnlPct };
}
