import { json, error } from '../../_utils.js';
import { SETTINGS_DEFAULTS, fetchOne } from '../_providers.js';

// POST /api/market-data/auto-fetch
// Called on every page load. Triggers a default-provider fetch if the
// configured schedule time has passed today and no fetch has run yet.
export async function onRequestPost({ env }) {
  try {
    const rows = await env.DB.prepare('SELECT key, value FROM settings').all();
    const s = {};
    for (const { key, value } of (rows.results || [])) {
      try { s[key] = JSON.parse(value); } catch { s[key] = value; }
    }

    const enabled = s['market.schedule.enabled'] ?? SETTINGS_DEFAULTS['market.schedule.enabled'];
    if (!enabled) return json({ triggered: false });

    // Vietnam time (UTC+7)
    const nowVN = new Date(Date.now() + 7 * 3600 * 1000);
    const scheduleTime = s['market.schedule.time'] ?? SETTINGS_DEFAULTS['market.schedule.time'];
    const [schedH, schedM] = scheduleTime.split(':').map(Number);

    if (nowVN.getUTCHours() < schedH ||
        (nowVN.getUTCHours() === schedH && nowVN.getUTCMinutes() < schedM)) {
      return json({ triggered: false });
    }

    // Check if already fetched today at/after schedule time
    const lastFetch = s['market.last_fetch'];
    if (lastFetch) {
      const lastVN = new Date(new Date(lastFetch).getTime() + 7 * 3600 * 1000);
      const todayStr = nowVN.toISOString().slice(0, 10);
      if (lastVN.toISOString().slice(0, 10) === todayStr &&
          (lastVN.getUTCHours() > schedH ||
           (lastVN.getUTCHours() === schedH && lastVN.getUTCMinutes() >= schedM))) {
        return json({ triggered: false });
      }
    }

    // Run fetch for default providers only
    const subtypes = ['vang', 'usd'];
    const results = [];
    let totalUpdated = 0;

    for (const subtype of subtypes) {
      const defaultProviderId = s[`market.provider.${subtype}`]
        ?? SETTINGS_DEFAULTS[`market.provider.${subtype}`];
      const result = await fetchOne(env, defaultProviderId, subtype);
      results.push(result);
      totalUpdated += result.assetsUpdated || 0;
    }

    return json({ triggered: true, updated: totalUpdated, results });
  } catch (err) {
    return error(err.message, 500);
  }
}
