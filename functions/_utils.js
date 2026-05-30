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
    return (mat - start) / 86400000 / 365;
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
