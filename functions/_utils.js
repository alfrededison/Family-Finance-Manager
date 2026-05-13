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

// Accrued interest for bank / tiền gửi:
//   principal × (rate/100) × years × (1 − tax)
// Time caps at maturity_date if it has passed.
export function computeAccrualPnl(a) {
  if (a.group_id !== 'bank' && a.group_id !== 'tien-gui') return 0;
  if (a.interest_rate == null || !a.start_date) return 0;

  const start = new Date(a.start_date);
  if (isNaN(start.getTime())) return 0;

  let end = new Date();
  if (a.maturity_date) {
    const mat = new Date(a.maturity_date);
    if (!isNaN(mat.getTime()) && mat < end) end = mat;
  }
  if (end < start) return 0;

  const years = (end - start) / 86400000 / 365;
  const principal = a.group_id === 'bank' ? (a.current_price || 0) : (a.cost_price || 0);
  const taxRate = a.interest_tax_rate != null ? a.interest_tax_rate / 100 : 0;

  return principal * (a.interest_rate / 100) * years * (1 - taxRate);
}

// Returns { value, cost, pnl, pnlPct } for an asset row.
// Bank/tiền gửi use accrued interest; everything else uses qty × price diff.
export function computeAssetMetrics(a) {
  if (a.group_id === 'bank' || a.group_id === 'tien-gui') {
    const principal = a.group_id === 'bank' ? (a.current_price || 0) : (a.cost_price || 0);
    const pnl = computeAccrualPnl(a);
    const cost = principal;
    const value = principal + pnl;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    return { value, cost, pnl, pnlPct };
  }
  const value = (a.qty || 0) * (a.current_price || 0);
  const cost = (a.qty || 0) * (a.cost_price || 0);
  const pnl = value - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  return { value, cost, pnl, pnlPct };
}
