import { json, error, readBody, nowISO } from '../_utils.js';

// Column definitions per table (used to bind insert params consistently).
const COLUMNS = {
  members:   ['id', 'name', 'color', 'created_at'],
  platforms: ['id', 'name'],
  assets: [
    'id', 'name', 'group_id', 'subtype', 'member_id', 'qty', 'unit',
    'cost_price', 'current_price', 'platform', 'term', 'maturity_date', 'bank',
    'interest_rate', 'interest_tax_rate', 'start_date', 'end_date', 'notes',
    'status', 'created_at', 'updated_at',
  ],
  transactions: [
    'id', 'date', 'type', 'asset_id', 'member_id', 'qty', 'unit_price',
    'fee', 'tax', 'total', 'notes', 'created_at',
  ],
  price_history: ['id', 'asset_id', 'price', 'recorded_at', 'source'],
};

// Delete order (child → parent) to satisfy FK constraints.
const DELETE_ORDER = [
  'price_history',
  'transactions',
  'assets',
  'platforms',
  'members',
];

// POST /api/import  { mode: 'replace' | 'merge', data: {...} }
export async function onRequestPost({ env, request }) {
  try {
    const body = await readBody(request);
    const mode = body.mode === 'merge' ? 'merge' : 'replace';
    const data = body.data;
    if (!data || typeof data !== 'object') {
      return error('Thiếu trường data', 400);
    }

    const stats = mode === 'replace'
      ? await runReplace(env, data)
      : await runMerge(env, data);

    return json({ ok: true, mode, stats });
  } catch (err) {
    return error(err.message, 500);
  }
}

// ── Replace mode ───────────────────────────────────────────────────────────
// Wipe all tables, then re-insert with original IDs preserved.
async function runReplace(env, data) {
  for (const t of DELETE_ORDER) {
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  }

  const stats = {};
  for (const t of Object.keys(COLUMNS)) {
    const rows = Array.isArray(data[t]) ? data[t] : [];
    stats[t] = await insertRows(env, t, rows, COLUMNS[t]);
  }
  return stats;
}

// ── Merge mode ─────────────────────────────────────────────────────────────
// Insert with new auto-IDs, remap foreign keys via id-maps.
async function runMerge(env, data) {
  const stats = {};
  const memberMap = {};
  const platformMap = {};
  const assetMap = {};

  // members
  stats.members = 0;
  for (const r of (data.members || [])) {
    const newId = await insertGetId(env,
      'INSERT INTO members (name, color, created_at) VALUES (?, ?, ?)',
      [r.name, r.color || '#3b82f6', r.created_at || nowISO()]);
    memberMap[r.id] = newId;
    stats.members++;
  }

  // platforms — unique on name
  stats.platforms = 0;
  for (const r of (data.platforms || [])) {
    const existing = await env.DB.prepare('SELECT id FROM platforms WHERE name = ?').bind(r.name).first();
    if (existing) {
      platformMap[r.id] = existing.id;
    } else {
      const newId = await insertGetId(env,
        'INSERT INTO platforms (name) VALUES (?)', [r.name]);
      platformMap[r.id] = newId;
      stats.platforms++;
    }
  }

  // assets
  stats.assets = 0;
  for (const r of (data.assets || [])) {
    const newId = await insertGetId(env, `
      INSERT INTO assets (
        name, group_id, subtype, member_id, qty, unit,
        cost_price, current_price, platform, term, maturity_date, bank,
        interest_rate, interest_tax_rate, start_date, end_date, notes,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      r.name, r.group_id, r.subtype || null,
      r.member_id != null ? (memberMap[r.member_id] ?? null) : null,
      Number(r.qty || 0), r.unit || null,
      Number(r.cost_price || 0), Number(r.current_price || 0),
      r.platform || null, r.term || null, r.maturity_date || null, r.bank || null,
      r.interest_rate ?? null, r.interest_tax_rate ?? null,
      r.start_date || null, r.end_date || null, r.notes || null,
      r.status || 'active', r.created_at || nowISO(), r.updated_at || nowISO(),
    ]);
    assetMap[r.id] = newId;
    stats.assets++;
  }

  // transactions
  stats.transactions = 0;
  for (const r of (data.transactions || [])) {
    const assetId = assetMap[r.asset_id];
    if (assetId == null) continue;  // skip dangling refs
    await env.DB.prepare(`
      INSERT INTO transactions (date, type, asset_id, member_id, qty, unit_price, fee, tax, total, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      r.date, r.type, assetId,
      r.member_id != null ? (memberMap[r.member_id] ?? null) : null,
      Number(r.qty || 0), Number(r.unit_price || 0),
      Number(r.fee || 0), Number(r.tax || 0), Number(r.total || 0),
      r.notes || null, r.created_at || nowISO(),
    ).run();
    stats.transactions++;
  }

  // price_history
  stats.price_history = 0;
  for (const r of (data.price_history || [])) {
    const assetId = assetMap[r.asset_id];
    if (assetId == null) continue;
    await env.DB.prepare(
      'INSERT INTO price_history (asset_id, price, recorded_at, source) VALUES (?, ?, ?, ?)'
    ).bind(assetId, Number(r.price || 0), r.recorded_at || nowISO(), r.source || 'manual').run();
    stats.price_history++;
  }

  return stats;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function insertRows(env, table, rows, columns) {
  if (!rows.length) return 0;
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  let count = 0;
  for (const r of rows) {
    const values = columns.map((c) => (r[c] === undefined ? null : r[c]));
    await env.DB.prepare(sql).bind(...values).run();
    count++;
  }
  return count;
}

async function insertGetId(env, sql, params) {
  const res = await env.DB.prepare(sql).bind(...params).run();
  return res.meta.last_row_id;
}
