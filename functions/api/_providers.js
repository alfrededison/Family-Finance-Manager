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

// ── Provider registry ───────────────────────────────────────────────────────

export const PROVIDERS = {
  doji:        { id: 'doji',        name: 'DOJI (24h)',  subtypes: ['vang'], fetch: fetchDoji },
  tygiausd:    { id: 'tygiausd',    name: 'TyGiaUSD',    subtypes: ['usd'],  fetch: fetchTyGiaUsd },
  techcombank: { id: 'techcombank', name: 'Techcombank', subtypes: ['usd'],  fetch: fetchTechcombank },
};


export const SETTINGS_DEFAULTS = {
  'market.provider.vang': 'doji',
  'market.provider.usd':  'tygiausd',
  'market.last_fetch':    null,
};

// ── Core fetch + update logic ───────────────────────────────────────────────

export async function fetchOne(env, providerId, subtype) {
  const provider = PROVIDERS[providerId];
  if (!provider) return { provider: providerId, subtype, error: 'unknown provider' };

  let prices;
  try {
    prices = await provider.fetch();
  } catch (err) {
    return { provider: providerId, subtype, error: err.message };
  }

  const now = nowISO();

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
    const updateRes = await env.DB.prepare(
      "UPDATE assets SET current_price = ?, updated_at = ? WHERE subtype = ? AND status = 'active'",
    ).bind(prices.price, now, subtype).run();
    assetsUpdated = updateRes.meta?.changes ?? 0;

    if (assetsUpdated > 0) {
      const assetRows = await env.DB.prepare(
        "SELECT id FROM assets WHERE subtype = ? AND status = 'active'",
      ).bind(subtype).all();
      const source = `market:${providerId}`;
      const stmts = (assetRows.results || []).map((a) =>
        env.DB.prepare('INSERT INTO price_history (asset_id, price, recorded_at, source) VALUES (?, ?, ?, ?)')
          .bind(a.id, prices.price, now, source),
      );
      if (stmts.length > 0) await env.DB.batch(stmts);

      await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .bind('market.last_fetch', JSON.stringify(now)).run();
    }
  }

  return { provider: providerId, subtype, prices, assetsUpdated, isDefault, fetched_at: now };
}
