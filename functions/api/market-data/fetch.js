import { json, error, readBody } from '../../_utils.js';
import { fetchOne, fetchAllProviders } from '../_providers.js';

// POST /api/market-data/fetch
// Body: {} — fetch all providers for all supported subtypes
// Body: { provider, subtype } — fetch one specific provider
export async function onRequestPost({ env, request }) {
  try {
    const body = await readBody(request);
    const { provider: providerId, subtype } = body || {};

    const results = providerId && subtype
      ? [await fetchOne(env, providerId, subtype)]
      : await fetchAllProviders(env);

    const assetsUpdated = results.reduce((sum, r) => sum + (r.assetsUpdated || 0), 0);
    return json({ results, assetsUpdated });
  } catch (err) {
    return error(err.message, 500);
  }
}
