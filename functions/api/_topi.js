// Shape-detection for Topi's GetBalanceProfileProduct response, shared by the
// sync endpoint and the settings-page import preview.
//
// The same payload reaches us in several shapes depending on how it was captured:
//   1. Bookmarklet bundle — {captures: [{product_type_id, response}]}
//   2. Gateway-wrapped    — {code: 200, message, data: <backend body>}   (what the bookmarklet sees)
//   3. Bare backend body  — {Code: 0, Message, Data: <payload>}          (what a proxy like Reqable sees)
//   4. Just the payload   — {ProfileProductPNL, ListProduct}
// Shapes 2–4 may also be wrapped in an array, so both tabs (Tiền gửi + Vàng)
// can be pasted in one go.

export const TOPI_PID = { 'tien-gui': 6, 'vang': 7 };

const INVALID = 'Dữ liệu Topi không hợp lệ';

// Peel the wrappers off until we reach the payload object, or null if this
// isn't a Topi response at all. Throws when the response reports a failure.
function unwrap(payload) {
  if (!payload || typeof payload !== 'object') return null;

  if (typeof payload.code === 'number') {
    if (payload.code !== 200) throw new Error(payload.message?.trim() || INVALID);
    return unwrap(payload.data);
  }

  if (payload.Data !== undefined) {
    if (typeof payload.Code === 'number' && payload.Code !== 0) {
      throw new Error(payload.Message?.trim() || INVALID);
    }
    return unwrap(payload.Data);
  }

  if (payload.ListProduct || payload.ProfileProductPNL) return payload;
  return null;
}

// Which product type a payload belongs to. Returns 0 when undeterminable —
// including the portfolio-summary endpoint, where ProfileProductPNL is an
// array covering every product type at once rather than a single one.
// An unidentified payload is never imported: guessing wrong would file gold
// under deposits *and* close out every deposit missing from the gold set.
function productTypeOf(data) {
  const pnl = data?.ProfileProductPNL;
  if (!pnl || Array.isArray(pnl)) return 0;
  return Number(pnl.ProductTypeId) || 0;
}

// A payload without ListProduct holds no holdings to import — the portfolio
// summary endpoint is the usual culprit. Dropping it here matters: an empty
// import would close out every asset the instance already owns.
function toCapture(payload, explicitProductTypeId) {
  const data = unwrap(payload);
  if (!data || !Array.isArray(data.ListProduct)) return null;
  return { productTypeId: explicitProductTypeId || productTypeOf(data), data };
}

// Any accepted shape → [{ productTypeId, data }]. Throws on a failed response.
export function normalizeTopiCaptures(rawData) {
  if (Array.isArray(rawData?.captures)) {
    return rawData.captures
      .map((c) => toCapture(c.response, Number(c.product_type_id) || 0))
      .filter(Boolean);
  }

  return (Array.isArray(rawData) ? rawData : [rawData])
    .map((p) => toCapture(p, 0))
    .filter(Boolean);
}

export function findTopiCapture(captures, productTypeId) {
  return captures.find((c) => c.productTypeId === productTypeId) ?? null;
}

// Flatten a payload into the individual holdings worth importing.
export function topiProfileProducts(data) {
  const items = [];
  for (const product of (data.ListProduct ?? [])) {
    for (const pp of (product.ProfileProducts ?? [])) {
      if ((pp.TotalValue ?? 0) <= 0) continue;
      items.push({ product, pp });
    }
  }
  return items;
}
