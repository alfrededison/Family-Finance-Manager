import { nowISO } from '../_utils.js';

// Build the asset_deltas INSERT statement for a current_price change.
function priceDeltaStmt(env, assetId, oldPrice, newPrice, now, source) {
  return env.DB.prepare(
    'INSERT INTO asset_deltas (asset_id, type, changes, recorded_at, source, note) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(
    assetId,
    'edit',
    JSON.stringify([{ field: 'current_price', old: oldPrice, new: newPrice }]),
    now,
    source,
    null,
  );
}

// ── Shared helpers ──────────────────────────────────────────────────────────

async function extractCells(url, cssSelector, limit = Infinity) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const cells = [];
  await new HTMLRewriter()
    .on(cssSelector, {
      element() { cells.push(''); },
      text(chunk) { cells[cells.length - 1] += chunk.text; },
    })
    .transform(res).text();
  return cells.slice(0, limit).map((s) => s.trim());
}

// Parse the first number in a string, treating . and , as thousands separators.
function parsePrice(str) {
  return Number(String(str ?? '').match(/[\d.,]+/)?.[0]?.replace(/[.,]/g, '') || 0);
}

// ── Provider fetch functions ────────────────────────────────────────────────

async function fetchDoji() {
  // Official DOJI feed (SJC 1L price is uniform nationwide).
  const res = await fetch('https://update.giavang.doji.vn/banggia/doji_92409/getmt', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from DOJI`);
  const xml = await res.text();
  // <Row Name='SJC -Bán Lẻ' Key='doji_0' Sell='14,600' Buy='14,300' /> — Buy is the "mua vào" price.
  console.log('DOJI XML:', xml);
  const row = xml.match(/Key='doji_0'[^>]*/)?.[0] || '';
  const price = parsePrice(row.match(/Buy='([\d.,]+)'/)?.[1]) * 1000;
  if (!price) throw new Error('DOJI: không lấy được giá');
  return { price };
}

async function fetchTyGiaUsd() {
  const cells = await extractCells('https://tygiausd.org/', 'table tr td.text-right', 1);
  console.log('TyGiaUSD cells:', cells);
  // td includes a child span (change indicator) — parsePrice takes only the first number sequence
  const price = parsePrice(cells[0]);
  if (!price) throw new Error('TyGiaUSD: không lấy được tỷ giá');
  return { price };
}

async function fetchTechcombank() {
  // Official JSON feed behind techcombank.com/cong-cu-tien-ich/ty-gia
  const res = await fetch(
    'https://techcombank.com/content/techcombank/web/vn/vi/cong-cu-tien-ich/ty-gia/_jcr_content.exchange-rates.integration.json',
    { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} from Techcombank`);
  const data = await res.json();
  // bidRateTM = mua tiền mặt, bidRateCK = mua chuyển khoản, askRate = bán
  console.log('Techcombank exchange rates:', data?.exchangeRate?.data);
  const usd = (data?.exchangeRate?.data || []).find((r) => r.label === 'USD (50,100)');
  const price = Number(usd?.bidRateCK);
  if (!price) throw new Error('Techcombank: không lấy được tỷ giá');
  return { price };
}

// VPS public API — batch price feed for Vietnamese stocks.
// lastPrice is quoted in thousands VND (e.g. 60.7 → 60,700 VND).
// Falls back to reference price (r) when lastPrice is 0 (market closed).
async function fetchVps(tickers) {
  if (tickers.length === 0) return { prices: {} };

  const res = await fetch(
    `https://bgapidatafeed.vps.com.vn/getliststockdata/${tickers.join(',')}`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} from VPS`);
  const data = await res.json();

  const prices = {};
  for (const item of data) {
    const ticker = (item.sym || '').toUpperCase();
    if (!ticker) continue;
    const raw = item.lastPrice || item.r || 0;
    const price = Math.round(Number(raw) * 1000);
    if (price > 0) prices[ticker] = price;
  }
  return { prices };
}

// ── Provider registry ───────────────────────────────────────────────────────

export const PROVIDERS = {
  doji:        { id: 'doji',        name: 'DOJI (24h)',  subtypes: ['vang'],      fetch: fetchDoji },
  tygiausd:    { id: 'tygiausd',    name: 'TyGiaUSD',    subtypes: ['usd'],       fetch: fetchTyGiaUsd },
  techcombank: { id: 'techcombank', name: 'Techcombank', subtypes: ['usd'],       fetch: fetchTechcombank },
  vps:         { id: 'vps',         name: 'VPS',         subtypes: ['co-phieu'],  fetch: fetchVps,  perTicker: true },
};


export const SETTINGS_DEFAULTS = {
  'market.provider.vang':      'doji',
  'market.provider.usd':       'tygiausd',
  'market.provider.co-phieu':  'vps',
  'market.last_fetch':         null,
};

// ── Core fetch + update logic ───────────────────────────────────────────────
//
// `userId` is optional:
//   - When provided (UI fetch path): asset SELECT/UPDATE are scoped to that user.
//   - When omitted (cron path): the same asset writes apply globally to ALL users
//     in a single SQL statement — no per-user loop, no duplicate HTTP traffic.

function scopeClause(userId) {
  return userId == null ? '' : ' AND user_id = ?';
}
function scopeParams(base, userId) {
  return userId == null ? base : [...base, userId];
}

// Per-ticker providers: each asset has its own ticker → fetch a map of { TICKER: price }.
async function fetchOnePerTicker(env, provider, subtype, now, userId) {
  const assetRows = await env.DB.prepare(
    "SELECT id, ticker, current_price FROM assets WHERE subtype = ? AND status = 'active' AND ticker IS NOT NULL AND ticker != ''"
    + scopeClause(userId),
  ).bind(...scopeParams([subtype], userId)).all();

  const assets = assetRows.results || [];
  if (assets.length === 0) {
    return { provider: provider.id, subtype, prices: {}, assetsUpdated: 0, isDefault: true, fetched_at: now };
  }

  const tickers = [...new Set(assets.map((a) => a.ticker.toUpperCase()))];

  let result;
  try {
    result = await provider.fetch(tickers);
  } catch (err) {
    return { provider: provider.id, subtype, error: err.message };
  }

  const prices = result.prices || {};
  console.log('VPS prices:', prices);

  const cacheKey = `market.cache.${subtype}.${provider.id}`;
  await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .bind(cacheKey, JSON.stringify({ prices, fetched_at: now })).run();

  const defaultRow = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
    .bind(`market.provider.${subtype}`).first();
  const defaultProviderId = defaultRow
    ? JSON.parse(defaultRow.value)
    : SETTINGS_DEFAULTS[`market.provider.${subtype}`];
  const isDefault = defaultProviderId === provider.id;

  let assetsUpdated = 0;

  if (isDefault) {
    const stmts = [];
    for (const asset of assets) {
      const price = prices[asset.ticker.toUpperCase()];
      if (!price) continue;
      stmts.push(
        env.DB.prepare("UPDATE assets SET current_price = ?, updated_at = ? WHERE id = ?")
          .bind(price, now, asset.id),
      );
      // Only record a delta when the price actually changed.
      if (Number(price) !== Number(asset.current_price)) {
        stmts.push(priceDeltaStmt(env, asset.id, asset.current_price, price, now, `market:${provider.id}`));
      }
      assetsUpdated++;
    }
    if (stmts.length > 0) {
      await env.DB.batch(stmts);
      await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .bind('market.last_fetch', JSON.stringify(now)).run();
    }
  }

  return { provider: provider.id, subtype, prices, assetsUpdated, isDefault, fetched_at: now };
}

export async function fetchAllProviders(env, userId) {
  const tasks = [];
  for (const p of Object.values(PROVIDERS)) {
    for (const st of p.subtypes) {
      tasks.push(fetchOne(env, p.id, st, userId));
    }
  }
  return Promise.all(tasks);
}

export async function fetchOne(env, providerId, subtype, userId) {
  const provider = PROVIDERS[providerId];
  if (!provider) return { provider: providerId, subtype, error: 'unknown provider' };

  const now = nowISO();

  if (provider.perTicker) {
    return fetchOnePerTicker(env, provider, subtype, now, userId);
  }

  let prices;
  try {
    prices = await provider.fetch();
  } catch (err) {
    return { provider: providerId, subtype, error: err.message };
  }

  // Cache result globally — provider data isn't user-specific.
  const cacheKey = `market.cache.${subtype}.${providerId}`;
  await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .bind(cacheKey, JSON.stringify({ ...prices, fetched_at: now })).run();

  // Check if this is the default provider for this subtype
  const defaultRow = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
    .bind(`market.provider.${subtype}`).first();
  const defaultProviderId = defaultRow
    ? JSON.parse(defaultRow.value)
    : SETTINGS_DEFAULTS[`market.provider.${subtype}`];

  const isDefault = defaultProviderId === providerId;
  let assetsUpdated = 0;

  if (isDefault) {
    // Read old prices before update so they can be stored in history.
    const assetRows = await env.DB.prepare(
      "SELECT id, current_price FROM assets WHERE subtype = ? AND status = 'active'"
      + scopeClause(userId),
    ).bind(...scopeParams([subtype], userId)).all();

    const updateRes = await env.DB.prepare(
      "UPDATE assets SET current_price = ?, updated_at = ? WHERE subtype = ? AND status = 'active'"
      + scopeClause(userId),
    ).bind(...scopeParams([prices.price, now, subtype], userId)).run();
    assetsUpdated = updateRes.meta?.changes ?? 0;

    if (assetsUpdated > 0) {
      const source = `market:${providerId}`;
      const stmts = (assetRows.results || [])
        .filter((a) => Number(prices.price) !== Number(a.current_price))
        .map((a) => priceDeltaStmt(env, a.id, a.current_price, prices.price, now, source));
      if (stmts.length > 0) await env.DB.batch(stmts);

      await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .bind('market.last_fetch', JSON.stringify(now)).run();
    }
  }

  return { provider: providerId, subtype, prices, assetsUpdated, isDefault, fetched_at: now };
}
