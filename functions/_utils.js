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

// Interest for bank / tiền gửi:
//   principal × (rate/100) × years × (1 − tax)
// Fixed-term (has maturity_date): uses full term (start → maturity).
// Flexible (no maturity_date): uses elapsed time (start → today).
export function computeAccrualPnl(a) {
  if (a.group_id !== 'bank' && a.group_id !== 'tien-gui') return 0;
  if (a.interest_rate == null || !a.start_date) return 0;

  const start = new Date(a.start_date);
  if (isNaN(start.getTime())) return 0;

  let end;
  if (a.maturity_date) {
    const mat = new Date(a.maturity_date);
    end = isNaN(mat.getTime()) ? new Date() : mat;
  } else {
    end = new Date();
  }
  if (end < start) return 0;

  const years = (end - start) / 86400000 / 365;
  const principal = a.group_id === 'bank' ? (a.current_price || 0) : (a.cost_price || 0);
  const taxRate = a.interest_tax_rate != null ? a.interest_tax_rate / 100 : 0;

  return principal * (a.interest_rate / 100) * years * (1 - taxRate);
}

// Forward-looking interest for cho-vay / đi-vay:
//   - has start_date + maturity_date: full period interest = principal × rate × years
//   - else: one month of interest = principal × rate / 12
// Returns null when inputs are insufficient.
export function computeLoanInterest(a) {
  if (a.interest_rate == null) return null;
  const principal = a.cost_price || 0;
  if (principal <= 0) return null;
  const ratePct = a.interest_rate / 100;

  if (a.start_date && a.maturity_date) {
    const start = new Date(a.start_date);
    const end = new Date(a.maturity_date);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
      const years = (end - start) / 86400000 / 365;
      return principal * ratePct * years;
    }
  }
  return principal * ratePct / 12;
}

// Returns { value, cost, pnl, pnlPct } for an asset row.
// - Bank / tiền gửi: interest to maturity (if fixed-term) or accrued to today (if flexible).
// - Cho vay / đi vay: forward-looking interest (monthly, or total to maturity).
//   pnl = +interest (cho-vay) or −interest (đi-vay). cost equals value so the
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
    const principal = a.cost_price || 0;
    const pnlPct = pnl != null && principal > 0 ? (pnl / principal) * 100 : null;
    return { value, cost: value, pnl, pnlPct };
  }
  const value = (a.qty || 0) * (a.current_price || 0);
  const cost = (a.qty || 0) * (a.cost_price || 0);
  const pnl = value - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  return { value, cost, pnl, pnlPct };
}
