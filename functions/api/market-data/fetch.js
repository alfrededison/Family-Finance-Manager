import { json, error, readBody } from '../../_utils.js';
import { fetchOne, fetchAllProviders } from '../_providers.js';

// POST /api/market-data/fetch  — scoped to the caller's assets.
// Body: {} — fetch all providers for all supported subtypes (user's assets only)
// Body: { provider, subtype } — fetch one specific provider (user's assets only)
export async function onRequestPost({ env, request, data }) {
  try {
    const body = await readBody(request);
    const { provider: providerId, subtype } = body || {};
    const userId = data.user.id;

    const results = providerId && subtype
      ? [await fetchOne(env, providerId, subtype, userId)]
      : await fetchAllProviders(env, userId);

    const assetsUpdated = results.reduce((sum, r) => sum + (r.assetsUpdated || 0), 0);
    return json({ results, assetsUpdated });
  } catch (err) {
    return error(err.message, 500);
  }
}
