import { runSnapshot } from '../functions/_snapshot.js';
import { fetchAllProviders } from '../functions/api/_providers.js';

async function refreshAndSnapshot(env) {
  await fetchAllProviders(env);
  return runSnapshot(env);
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refreshAndSnapshot(env));
  },
  // Manual trigger for local testing:
  //   wrangler dev --config worker/wrangler.toml
  //   curl -X POST http://localhost:8787/
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('POST / to trigger a snapshot', { status: 405 });
    }
    const result = await refreshAndSnapshot(env);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
