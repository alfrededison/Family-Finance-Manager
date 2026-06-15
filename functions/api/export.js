import { json, error, nowISO } from '../_utils.js';

// GET /api/export — dump the current user's data as JSON.
// Per-user tables are filtered by user_id. Global tables (platforms) included.
// Market-provider global settings are NOT included (those belong to the install, not the user).
export async function onRequestGet({ env, data }) {
  try {
    const userId = data.user.id;

    const [members, assets, assetDeltas, userSettings, snapshots, platforms] = await Promise.all([
      env.DB.prepare('SELECT * FROM members WHERE user_id = ?').bind(userId).all(),
      env.DB.prepare('SELECT * FROM assets WHERE user_id = ?').bind(userId).all(),
      env.DB.prepare(`
        SELECT ad.* FROM asset_deltas ad
        JOIN assets a ON a.id = ad.asset_id
        WHERE a.user_id = ?
      `).bind(userId).all(),
      env.DB.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').bind(userId).all(),
      env.DB.prepare('SELECT * FROM asset_snapshots WHERE user_id = ?').bind(userId).all(),
      env.DB.prepare('SELECT * FROM platforms').all(),
    ]);

    return json({
      version: 3,
      exported_at: nowISO(),
      data: {
        members:         members.results || [],
        platforms:       platforms.results || [],
        assets:          assets.results || [],
        asset_deltas:    assetDeltas.results || [],
        user_settings:   userSettings.results || [],
        asset_snapshots: snapshots.results || [],
      },
    });
  } catch (err) {
    return error(err.message, 500);
  }
}
