import { json, error, readBody, nowISO } from '../_utils.js';

const TCBS_BASE = 'https://apiext.tcbs.com.vn';

function srcPrefix(service, instanceId) {
  return `__src:${service}:${instanceId}`;
}

function buildNotes(service, instanceId, keyType, keyValue) {
  return `${srcPrefix(service, instanceId)}|${keyType}:${keyValue}`;
}

function parseKey(notes) {
  const m = notes?.match(/\|[a-z]+:(.+)$/);
  return m?.[1] ?? null;
}

async function apiError(resp, fallback) {
  try {
    const body = await resp.json();
    const msg = body?.message || body?.error || body?.msg || body?.error_message;
    if (msg && typeof msg === 'string' && msg.trim()) return msg.trim();
  } catch { /* not JSON */ }
  return fallback;
}

// POST /api/sync — upsert assets from a 3rd-party integration instance
export async function onRequestPost({ env, request, data }) {
  try {
    const { service, instance_id, asset_types = [], raw_data } = await readBody(request);
    if (!service || !instance_id) return error('service and instance_id required', 400);
    if (!asset_types.length) return error('asset_types required', 400);

    const userId = data.user.id;

    const settingRow = await env.DB.prepare(
      'SELECT value FROM user_settings WHERE user_id = ? AND key = ?',
    ).bind(userId, `integration.${service}.instances`).first();
    if (!settingRow) return error('Instance not found', 404);

    let instances;
    try { instances = JSON.parse(settingRow.value); } catch { return error('Malformed instance config', 500); }
    const instance = instances.find((i) => i.id === instance_id);
    if (!instance) return error('Instance not found', 404);

    let totalAdded = 0, totalUpdated = 0, totalRemoved = 0;
    for (const assetType of asset_types) {
      const r = await syncType(env, userId, service, instance, assetType, raw_data);
      totalAdded += r.added;
      totalUpdated += r.updated;
      totalRemoved += r.removed;
    }

    return json({ added: totalAdded, updated: totalUpdated, removed: totalRemoved });
  } catch (err) {
    return error(err.message, 500);
  }
}

// DELETE /api/sync — soft-delete all assets owned by an instance
export async function onRequestDelete({ env, request, data }) {
  try {
    const url = new URL(request.url);
    const service = url.searchParams.get('service');
    const instance_id = url.searchParams.get('instance_id');
    if (!service || !instance_id) return error('service and instance_id required', 400);

    const userId = data.user.id;
    const prefix = srcPrefix(service, instance_id);
    const now = nowISO();

    const affected = await env.DB.prepare(
      `SELECT id, current_price FROM assets WHERE status = 'active' AND user_id = ? AND notes LIKE ?`,
    ).bind(userId, `${prefix}%`).all();

    for (const a of (affected.results ?? [])) {
      await env.DB.prepare(
        `INSERT INTO price_history (asset_id, price, recorded_at, source, type, note) VALUES (?, ?, ?, ?, 'delete', ?)`
      ).bind(a.id, a.current_price ?? 0, now, `sync:${service}`, 'Đã xoá (ngắt kết nối tích hợp)').run();
    }

    await env.DB.prepare(
      `UPDATE assets SET status = 'deleted', updated_at = ? WHERE status = 'active' AND user_id = ? AND notes LIKE ?`,
    ).bind(now, userId, `${prefix}%`).run();

    return json({ removed: affected.results?.length ?? 0 });
  } catch (err) {
    return error(err.message, 500);
  }
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

async function syncType(env, userId, service, instance, assetType, rawData) {
  if (service === 'topi') return syncTopi(env, userId, instance, assetType, rawData);
  if (service === 'tcbs') return syncTcbs(env, userId, instance, assetType);
  throw new Error(`Unknown service: ${service}`);
}

// ─── Topi ────────────────────────────────────────────────────────────────────

const TOPI_PID = { 'tien-gui': 6, 'vang': 7 };

async function syncTopi(env, userId, instance, assetType, rawData) {
  if (!rawData) throw new Error('Topi yêu cầu upload file JSON — không hỗ trợ sync tự động');
  if (!TOPI_PID[assetType]) throw new Error(`Topi does not support asset type: ${assetType}`);

  // Resolve payload — bundle format {captures:[...]} OR legacy raw response (deposit-only).
  let payload;
  if (Array.isArray(rawData.captures)) {
    const pid = TOPI_PID[assetType];
    const hit = rawData.captures.find((c) => Number(c.product_type_id) === pid);
    if (!hit) {
      console.log(`[Topi] no capture for ${assetType} (pid=${pid}) in bundle — skipping`);
      return { added: 0, updated: 0, removed: 0 };
    }
    payload = hit.response;
  } else {
    if (assetType !== 'tien-gui') {
      console.log(`[Topi] legacy raw file does not contain ${assetType} — skipping`);
      return { added: 0, updated: 0, removed: 0 };
    }
    payload = rawData;
  }

  if (payload.code !== 200) throw new Error(payload.message?.trim() || 'Dữ liệu Topi không hợp lệ');

  const products = payload.data?.Data?.ListProduct ?? [];
  const incoming = [];
  for (const product of products) {
    for (const pp of (product.ProfileProducts ?? [])) {
      if ((pp.TotalValue ?? 0) <= 0) continue;
      incoming.push({ product, pp });
    }
  }

  if (assetType === 'tien-gui') {
    return upsertAssets(env, userId, 'topi', instance, incoming, {
      groupId: 'tien-gui',
      toKey: ({ pp }) => ({ keyType: 'order', keyValue: pp.OrderNo }),
      toAsset: ({ product, pp }) => {
        const term = pp.Term ?? 0;
        const expiredDate = pp.ExpiredTime?.startsWith('0001') ? null : pp.ExpiredTime?.slice(0, 10);
        return {
          name: (pp.ProductName || product.ProductName || '').slice(0, 40),
          group_id: 'tien-gui',
          subtype: term === 0 ? 'tg-linh-hoat' : 'tg-co-dinh',
          cost_price: pp.TotalValue,
          current_price: pp.TotalValue,
          interest_rate: pp.InterestRate ?? null,
          interest_tax_rate: 5,
          term: term > 0 ? term : null,
          start_date: pp.CreateAt?.slice(0, 10) ?? null,
          maturity_date: term > 0 ? expiredDate : null,
          platform: 'Topi',
          qty: 1,
          unit: 'VND',
          ticker: null,
        };
      },
    });
  }

  // assetType === 'vang'
  return upsertAssets(env, userId, 'topi', instance, incoming, {
    groupId: 'tich-tru',
    subtype: 'vang',
    toKey: ({ pp }) => ({ keyType: 'order', keyValue: pp.OrderNo }),
    toAsset: ({ product, pp }) => {
      const qty = pp.Quantity ?? 0;
      const current = pp.Price ?? 0;
      const cost = qty > 0
        ? Math.round(((pp.TotalValue ?? 0) - (pp.Profit ?? 0)) / qty)
        : current;
      return {
        name: (pp.ProductName || product.ProductName || '').slice(0, 40),
        group_id: 'tich-tru',
        subtype: 'vang',
        qty,
        unit: 'chỉ',
        cost_price: cost,
        current_price: current,
        platform: 'Topi',
        ticker: null,
        interest_rate: null,
        interest_tax_rate: null,
        term: null,
        start_date: pp.CreateAt?.slice(0, 10) ?? null,
        maturity_date: null,
      };
    },
  });
}

// ─── TCBS ────────────────────────────────────────────────────────────────────

async function syncTcbs(env, userId, instance, assetType) {
  const { token, custody_code, tcbs_id } = instance;
  const headers = { Authorization: `Bearer ${token}` };

  if (assetType === 'co-phieu') {
    const resp = await fetch(
      `${TCBS_BASE}/hft-krema/v1/customers/${custody_code}/se?secTypeName=STOCK`,
      { headers }
    );
    if (!resp.ok) throw new Error(await apiError(resp, 'Token TCBS không hợp lệ hoặc đã hết hạn'));
    const data = await resp.json();
    console.log('[TCBS co-phieu]', JSON.stringify(data));
    const positions = Array.isArray(data) ? data : (data.stock ?? data.data ?? data.result ?? []);

    return upsertAssets(env, userId, 'tcbs', instance, positions, {
      groupId: 'dau-tu',
      subtype: 'co-phieu',
      toKey: (p) => ({ keyType: 'sym', keyValue: p.symbol }),
      toAsset: (p) => ({
        name: p.symbol,
        group_id: 'dau-tu',
        subtype: 'co-phieu',
        qty: p.totalQtty ?? 0,
        unit: 'cp',
        cost_price: p.costPrice ?? 0,
        current_price: p.currentPrice ?? 0,
        ticker: p.symbol,
      }),
    });
  }

  if (assetType === 'trai-phieu') {
    const resp = await fetch(
      `${TCBS_BASE}/bond-trading/v4/customers/${tcbs_id}/assets`,
      { headers }
    );
    if (!resp.ok) throw new Error(await apiError(resp, 'Token TCBS không hợp lệ hoặc đã hết hạn'));
    const data = await resp.json();
    console.log('[TCBS trai-phieu]', JSON.stringify(data));
    const bonds = data.assets ?? data.data ?? (Array.isArray(data) ? data : []);

    return upsertAssets(env, userId, 'tcbs', instance, bonds, {
      groupId: 'dau-tu',
      subtype: 'trai-phieu',
      toKey: (b) => ({ keyType: 'bond', keyValue: b.bondCode }),
      toAsset: (b) => ({
        name: b.bondCode,
        group_id: 'dau-tu',
        subtype: 'trai-phieu',
        qty: b.totalQuantity ?? 0,
        unit: 'trái phiếu',
        cost_price: (b.value ?? 0) / (b.totalQuantity || 1),
        current_price: (b.value ?? 0) / (b.totalQuantity || 1),
        maturity_date: b.maturityDate?.slice(0, 10) ?? null,
        ticker: null,
      }),
    });
  }

  if (assetType === 'ccq') {
    const resp = await fetch(`${TCBS_BASE}/ifund/v3/tc3/balances/account/cache`, { headers });
    if (!resp.ok) throw new Error(await apiError(resp, 'Token TCBS không hợp lệ hoặc đã hết hạn'));
    const data = await resp.json();
    console.log('[TCBS ccq]', JSON.stringify(data));
    const funds = data.balanceList ?? data.data ?? (Array.isArray(data) ? data : []);

    return upsertAssets(env, userId, 'tcbs', instance, funds, {
      groupId: 'dau-tu',
      subtype: 'ccq',
      toKey: (f) => ({ keyType: 'fund', keyValue: f.productId }),
      toAsset: (f) => ({
        name: f.productId,
        group_id: 'dau-tu',
        subtype: 'ccq',
        qty: f.totalVolume ?? 0,
        unit: 'CCQ',
        cost_price: f.navAverage ?? f.navCurent ?? 0,
        current_price: f.navCurent ?? 0,
        ticker: f.productId,
      }),
    });
  }

  if (assetType === 'tien-mat') {
    const resp = await fetch(
      `${TCBS_BASE}/cappu/v1/customers/${custody_code}/queryBankBalance`,
      { headers }
    );
    if (!resp.ok) throw new Error(await apiError(resp, 'Token TCBS không hợp lệ hoặc đã hết hạn'));
    const data = await resp.json();
    console.log('[TCBS tien-mat]', JSON.stringify(data));
    const balances = (data.data ?? []).filter((b) => (b.available ?? 0) > 0);

    return upsertAssets(env, userId, 'tcbs', instance, balances, {
      groupId: 'bank',
      subtype: 'tk-tu-do',
      toKey: (b) => ({ keyType: 'partner', keyValue: b.partner }),
      toAsset: (b) => ({
        name: b.partner,
        group_id: 'bank',
        subtype: 'tk-tu-do',
        qty: 1,
        unit: 'VND',
        cost_price: b.available,
        current_price: b.available,
        platform: 'TCBS',
        ticker: null,
      }),
    });
  }

  throw new Error(`TCBS does not support asset type: ${assetType}`);
}

// ─── Generic upsert ──────────────────────────────────────────────────────────
// opts: { groupId, subtype?, toKey(item), toAsset(item) }

async function upsertAssets(env, userId, service, instance, incomingItems, opts) {
  const { groupId, subtype = null, toKey, toAsset } = opts;
  const prefix = srcPrefix(service, instance.id);
  const memberId = instance.member_id ? Number(instance.member_id) : null;
  const now = nowISO();

  // Load existing active assets owned by this instance (for this user) in the target group/subtype.
  let existingQuery = `SELECT id, notes, current_price FROM assets WHERE status = 'active' AND user_id = ? AND notes LIKE ? AND group_id = ?`;
  const existingParams = [userId, `${prefix}%`, groupId];
  if (subtype) { existingQuery += ` AND subtype = ?`; existingParams.push(subtype); }
  const existingRows = await env.DB.prepare(existingQuery).bind(...existingParams).all();

  // Map: upsert-key → { id, currentPrice }
  const existingMap = new Map();
  for (const row of (existingRows.results ?? [])) {
    const key = parseKey(row.notes);
    if (key) existingMap.set(key, { id: row.id, currentPrice: row.current_price });
  }

  let added = 0, updated = 0, removed = 0;
  const seenKeys = new Set();

  for (const item of incomingItems) {
    const { keyType, keyValue } = toKey(item);
    if (!keyValue) continue;
    seenKeys.add(String(keyValue));

    const a = toAsset(item);
    const notes = buildNotes(service, instance.id, keyType, keyValue);

    if (existingMap.has(String(keyValue))) {
      const { id, currentPrice: oldPrice } = existingMap.get(String(keyValue));
      await env.DB.prepare(`
        UPDATE assets SET
          name = ?, qty = ?, cost_price = ?, current_price = ?,
          interest_rate = ?, interest_tax_rate = ?,
          term = ?, start_date = ?, maturity_date = ?,
          subtype = ?, member_id = ?, notes = ?, ticker = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `).bind(
        a.name,
        a.qty ?? null,
        a.cost_price ?? 0,
        a.current_price ?? 0,
        a.interest_rate ?? null,
        a.interest_tax_rate ?? null,
        a.term ?? null,
        a.start_date ?? null,
        a.maturity_date ?? null,
        a.subtype ?? null,
        memberId,
        notes,
        a.ticker ?? null,
        now,
        id,
        userId,
      ).run();
      await env.DB.prepare(
        `INSERT INTO price_history (asset_id, price, old_price, recorded_at, source, type) VALUES (?, ?, ?, ?, ?, 'edit')`
      ).bind(id, a.current_price ?? 0, oldPrice ?? null, now, `sync:${service}`).run();
      updated++;
    } else {
      const result = await env.DB.prepare(`
        INSERT INTO assets (
          user_id, name, group_id, subtype, member_id, qty, unit,
          cost_price, current_price,
          platform, term, maturity_date,
          interest_rate, interest_tax_rate, start_date, notes, ticker,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `).bind(
        userId,
        a.name,
        a.group_id,
        a.subtype ?? null,
        memberId,
        a.qty ?? null,
        a.unit ?? null,
        a.cost_price ?? 0,
        a.current_price ?? 0,
        a.platform ?? null,
        a.term ?? null,
        a.maturity_date ?? null,
        a.interest_rate ?? null,
        a.interest_tax_rate ?? null,
        a.start_date ?? null,
        notes,
        a.ticker ?? null,
        now,
        now,
      ).run();
      await env.DB.prepare(
        `INSERT INTO price_history (asset_id, price, recorded_at, source, type) VALUES (?, ?, ?, ?, 'create')`
      ).bind(result.meta.last_row_id, a.current_price ?? 0, now, `sync:${service}`).run();
      added++;
    }
  }

  // Soft-delete positions that disappeared from the API response
  for (const [key, { id, currentPrice }] of existingMap) {
    if (!seenKeys.has(key)) {
      await env.DB.prepare(
        `UPDATE assets SET status = 'deleted', updated_at = ? WHERE id = ? AND user_id = ?`
      ).bind(now, id, userId).run();
      await env.DB.prepare(
        `INSERT INTO price_history (asset_id, price, recorded_at, source, type) VALUES (?, ?, ?, ?, 'delete')`
      ).bind(id, currentPrice ?? 0, now, `sync:${service}`).run();
      removed++;
    }
  }

  return { added, updated, removed };
}
