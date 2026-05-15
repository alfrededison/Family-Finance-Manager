import { json, error, readBody } from '../../_utils.js';
import { PROVIDERS, fetchOne } from '../_providers.js';

// POST /api/market-data/fetch
// Body: {} — fetch all providers for all supported subtypes
// Body: { provider, subtype } — fetch one specific provider
export async function onRequestPost({ env, request }) {
  try {
    const body = await readBody(request);
    const { provider: providerId, subtype } = body || {};

    const results = [];

    if (providerId && subtype) {
      results.push(await fetchOne(env, providerId, subtype));
    } else {
      // Fetch all providers across all their subtypes in parallel
      const tasks = [];
      for (const p of Object.values(PROVIDERS)) {
        for (const st of p.subtypes) {
          tasks.push(fetchOne(env, p.id, st));
        }
      }
      results.push(...await Promise.all(tasks));
    }

    const assetsUpdated = results.reduce((sum, r) => sum + (r.assetsUpdated || 0), 0);
    return json({ results, assetsUpdated });
  } catch (err) {
    return error(err.message, 500);
  }
}
