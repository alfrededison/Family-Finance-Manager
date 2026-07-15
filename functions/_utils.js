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

// Interest = principal × (rate/100) × years × (1 − tax).
// Years chosen by cycle rules:
//   - has maturity + end_of_term: full period (start → maturity)
//   - has maturity + monthly/quarterly: 1 cycle, capped by remaining-to-maturity
//   - no maturity + monthly (or NULL): 1/12 year
//   - no maturity + quarterly: 1/4 year
//   - no maturity + end_of_term: falls back to monthly (no period defined)
// NULL cycle ≡ end_of_term when has maturity, else monthly.
function pickInterestYears(a) {
  const cycle = a.interest_payment_cycle
    || (a.maturity_date ? 'end_of_term' : 'monthly');

  if (cycle === 'end_of_term' && a.start_date && a.maturity_date) {
    const start = new Date(a.start_date);
    const mat = new Date(a.maturity_date);
    if (isNaN(start.getTime()) || isNaN(mat.getTime()) || mat <= start) return 0;
    // Day count = maturity − start; +1 when the asset opts in to also
    // counting the maturity day (some banks do).
    const extraDay = a.interest_include_maturity ? 1 : 0;
    return ((mat - start) / 86400000 + extraDay) / 365;
  }

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

// Returns { value, cost, pnl, pnlPct } for an asset row.
// - Bank / tiền gửi & cho vay / đi vay: forward-looking interest per pickInterestYears().
//   For loans pnl = +interest (cho-vay) or −interest (đi-vay). cost equals value so the
//   dashboard's value-cost rollup isn't polluted by remaining-balance changes.
// - Everything else: qty × price diff.
export function computeAssetMetrics(a) {
  if (a.group_id === 'bank' || a.group_id === 'tien-gui') {
    const principal = a.group_id === 'bank' ? (a.current_price || 0) : (a.cost_price || 0);
    const pnl = computeAccrualPnl(a);
    const cost = principal;
    const value = principal + pnl;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    return { value, cost, pnl, pnlPct };
  }
  if (a.group_id === 'cho-vay' || a.group_id === 'di-vay') {
    const value = (a.qty || 0) * (a.current_price || 0);
    const interest = computeLoanInterest(a);
    const pnl = interest == null ? null : (a.group_id === 'di-vay' ? -interest : interest);
    const remaining = a.current_price || 0;
    const pnlPct = pnl != null && remaining > 0 ? (pnl / remaining) * 100 : null;
    return { value, cost: value, pnl, pnlPct };
  }
  const value = (a.qty || 0) * (a.current_price || 0);
  const cost = (a.qty || 0) * (a.cost_price || 0);
  const pnl = value - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  return { value, cost, pnl, pnlPct };
}
