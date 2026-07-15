import { json, error, readBody, nowISO } from '../_utils.js';

// POST /api/import  { mode: 'replace' | 'merge', data: {...} }
//
// Scope: this operates on the CURRENT user only. Replace wipes only this user's
// rows; merge inserts under the current user. `platforms` is global — merged
// in by name to avoid duplicates; never wiped from the replace branch.
export async function onRequestPost({ env, request, data }) {
  try {
    const body = await readBody(request);
    const mode = body.mode === 'merge' ? 'merge' : 'replace';
    const payload = body.data;
    if (!payload || typeof payload !== 'object') {
      return error('Thiếu trường data', 400);
    }

    const userId = data.user.id;
    const stats = mode === 'replace'
      ? await runReplace(env, userId, payload)
      : await runMerge(env, userId, payload);

    return json({ ok: true, mode, stats });
  } catch (err) {
    return error(err.message, 500);
  }
}

// ── Replace mode ───────────────────────────────────────────────────────────
// Wipe the user's own rows, then re-insert from payload (new auto-IDs).
async function runReplace(env, userId, payload) {
  // asset_deltas → first (FK to assets), but filter via assets join.
  await env.DB.prepare(`
    DELETE FROM asset_deltas WHERE asset_id IN (SELECT id FROM assets WHERE user_id = ?)
  `).bind(userId).run();
  await env.DB.prepare('DELETE FROM asset_snapshots WHERE user_id = ?').bind(userId).run();
  await env.DB.prepare('DELETE FROM assets WHERE user_id = ?').bind(userId).run();
  await env.DB.prepare('DELETE FROM members WHERE user_id = ?').bind(userId).run();
  await env.DB.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(userId).run();

  return runMerge(env, userId, payload);
}

// ── Merge mode ─────────────────────────────────────────────────────────────
// Insert with new auto-IDs, remap foreign keys via id-maps.
async function runMerge(env, userId, payload) {
  const stats = {};
  const memberMap = {};
  const platformMap = {};
  const assetMap = {};

  // members
  stats.members = 0;
  for (const r of (payload.members || [])) {
    const res = await env.DB.prepare(
      'INSERT INTO members (user_id, name, color, created_at) VALUES (?, ?, ?, ?)',
    ).bind(userId, r.name, r.color || '#3b82f6', r.created_at || nowISO()).run();
    memberMap[r.id] = res.meta.last_row_id;
    stats.members++;
  }

  // platforms — global, unique by name; map old → new id.
  stats.platforms = 0;
  for (const r of (payload.platforms || [])) {
    const existing = await env.DB.prepare('SELECT id FROM platforms WHERE name = ?').bind(r.name).first();
    if (existing) {
      platformMap[r.id] = existing.id;
    } else {
      const res = await env.DB.prepare('INSERT INTO platforms (name) VALUES (?)').bind(r.name).run();
      platformMap[r.id] = res.meta.last_row_id;
      stats.platforms++;
    }
  }

  // assets
  stats.assets = 0;
  for (const r of (payload.assets || [])) {
    const res = await env.DB.prepare(`
      INSERT INTO assets (
        user_id, name, group_id, subtype, member_id, qty, unit,
        cost_price, current_price, platform, term, maturity_date, bank,
        interest_rate, interest_tax_rate,
        interest_payment_day, interest_payment_cycle,
        interest_include_maturity,
        start_date, notes, ticker,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      r.name, r.group_id, r.subtype || null,
      r.member_id != null ? (memberMap[r.member_id] ?? null) : null,
      Number(r.qty || 0), r.unit || null,
      Number(r.cost_price || 0), Number(r.current_price || 0),
      r.platform || null, r.term || null, r.maturity_date || null, r.bank || null,
      r.interest_rate ?? null, r.interest_tax_rate ?? null,
      r.interest_payment_day ?? null, r.interest_payment_cycle || null,
      r.interest_include_maturity ? 1 : 0,
      r.start_date || null, r.notes || null, r.ticker || null,
      r.status || 'active', r.created_at || nowISO(), r.updated_at || nowISO(),
    ).run();
    assetMap[r.id] = res.meta.last_row_id;
    stats.assets++;
  }

  // asset_deltas
  stats.asset_deltas = 0;
  for (const r of (payload.asset_deltas || [])) {
    const assetId = assetMap[r.asset_id];
    if (assetId == null) continue;
    await env.DB.prepare(
      'INSERT INTO asset_deltas (asset_id, type, changes, recorded_at, source, note) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      assetId,
      r.type || 'edit',
      r.changes ?? null,
      r.recorded_at || nowISO(),
      r.source || 'manual',
      r.note ?? null,
    ).run();
    stats.asset_deltas++;
  }

  // asset_snapshots
  stats.asset_snapshots = 0;
  for (const r of (payload.asset_snapshots || [])) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO asset_snapshots
        (user_id, recorded_at, snapshot_date, group_id, subtype, value, cost, asset_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      r.recorded_at || nowISO(),
      r.snapshot_date,
      r.group_id,
      r.subtype || null,
      Number(r.value || 0),
      Number(r.cost || 0),
      Number(r.asset_count || 0),
    ).run();
    stats.asset_snapshots++;
  }

  // user_settings — per-user upsert by (user_id, key)
  // Integration instance configs embed member_id (numeric); members were
  // re-inserted with fresh auto-IDs above, so remap those refs via memberMap.
  stats.user_settings = 0;
  for (const r of (payload.user_settings || [])) {
    const value = /^integration\..+\.instances$/.test(r.key)
      ? remapInstanceMembers(r.value, memberMap)
      : r.value;
    await env.DB.prepare(
      'INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)',
    ).bind(userId, r.key, value).run();
    stats.user_settings++;
  }

  return stats;
}

// Rewrite member_id refs inside an integration instances JSON value using the
// old→new member id map. Returns the original string untouched on any failure
// (malformed JSON, unexpected shape), so non-instance settings survive intact.
function remapInstanceMembers(value, memberMap) {
  let instances;
  try { instances = JSON.parse(value); } catch { return value; }
  if (!Array.isArray(instances)) return value;
  for (const inst of instances) {
    if (inst && inst.member_id != null) {
      inst.member_id = memberMap[inst.member_id] ?? null;
    }
  }
  return JSON.stringify(instances);
}
