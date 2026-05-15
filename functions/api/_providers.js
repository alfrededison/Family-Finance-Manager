import { nowISO } from '../_utils.js';

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

function parseVnd(str) {
  return Number(String(str || '').replace(/[^\d]/g, ''));
}

// ── Provider fetch functions ────────────────────────────────────────────────

async function fetchDoji() {
  const cells = await extractCells(
    'https://www.24h.com.vn/gia-vang-hom-nay-c425.html',
    'tr[data-seach="doji_hn"] td',
    3,
  );
  console.log('DOJI cells:', cells);
  // cells[0] = label, cells[1] = price, cells[2] = buy-back price
  const price = Number((cells[1] || '').match(/[\d.,]+/)?.[0]?.replace(/[.,]/g, '') || 0) * 100;
  if (!price) throw new Error('DOJI: không lấy được giá');
  return { price };
}

async function fetchTyGiaUsd() {
  const cells = await extractCells('https://tygiausd.org/', 'table tr td.text-right', 1);
  console.log('TyGiaUSD cells:', cells);
  // td includes a child span (change indicator) — extract only the first number sequence
  const price = Number((cells[0] || '').match(/[\d.,]+/)?.[0]?.replace(/[.,]/g, '') || 0);
  if (!price) throw new Error('TyGiaUSD: không lấy được tỷ giá');
  return { price };
}

async function fetchTechcombank() {
  const cells = await extractCells(
    'https://techcombank.com/khach-hang-ca-nhan',
    'div.table-records__inner-top-body a p.body__item-currency-value',
    3,
  );
  console.log('Techcombank cells:', cells);
  // cells[0] = buy cash, cells[1] = transfer, cells[2] = sell
  const price = parseVnd(cells[1]);
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

// Per-ticker providers: each asset has its own ticker → fetch a map of { TICKER: price }.
async function fetchOnePerTicker(env, provider, subtype, now) {
  const assetRows = await env.DB.prepare(
    "SELECT id, ticker, current_price FROM assets WHERE subtype = ? AND status = 'active' AND ticker IS NOT NULL AND ticker != ''",
  ).bind(subtype).all();

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
      stmts.push(
        env.DB.prepare(
          'INSERT INTO price_history (asset_id, price, old_price, recorded_at, source, type) VALUES (?, ?, ?, ?, ?, ?)',
        ).bind(asset.id, price, asset.current_price, now, `market:${provider.id}`, 'edit'),
      );
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

export async function fetchOne(env, providerId, subtype) {
  const provider = PROVIDERS[providerId];
  if (!provider) return { provider: providerId, subtype, error: 'unknown provider' };

  const now = nowISO();

  if (provider.perTicker) {
    return fetchOnePerTicker(env, provider, subtype, now);
  }

  let prices;
  try {
    prices = await provider.fetch();
  } catch (err) {
    return { provider: providerId, subtype, error: err.message };
  }

  // Cache result in settings
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
    // Read old prices before update so they can be stored in history
    const assetRows = await env.DB.prepare(
      "SELECT id, current_price FROM assets WHERE subtype = ? AND status = 'active'",
    ).bind(subtype).all();

    const updateRes = await env.DB.prepare(
      "UPDATE assets SET current_price = ?, updated_at = ? WHERE subtype = ? AND status = 'active'",
    ).bind(prices.price, now, subtype).run();
    assetsUpdated = updateRes.meta?.changes ?? 0;

    if (assetsUpdated > 0) {
      const source = `market:${providerId}`;
      const stmts = (assetRows.results || []).map((a) =>
        env.DB.prepare(
          'INSERT INTO price_history (asset_id, price, old_price, recorded_at, source, type) VALUES (?, ?, ?, ?, ?, ?)',
        ).bind(a.id, prices.price, a.current_price, now, source, 'edit'),
      );
      if (stmts.length > 0) await env.DB.batch(stmts);

      await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .bind('market.last_fetch', JSON.stringify(now)).run();
    }
  }

  return { provider: providerId, subtype, prices, assetsUpdated, isDefault, fetched_at: now };
}
