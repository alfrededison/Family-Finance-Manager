import { runSnapshot } from '../functions/_snapshot.js';
import { fetchAllProviders } from '../functions/api/_providers.js';

async function refreshAndSnapshot(env) {
  // Fetch providers ONCE globally — the same HTTP responses apply to every user's
  // assets. Asset updates in fetchAllProviders run without a user_id filter, so
  // all users' assets get repriced in single SQL statements.
  const providers = await fetchAllProviders(env);

  const { results: users } = await env.DB.prepare('SELECT id FROM users').all();
  const userResults = [];
  for (const { id: userId } of (users || [])) {
    try {
      const snap = await runSnapshot(env, { userId });
      userResults.push({ userId, ok: true, ...snap });
    } catch (err) {
      userResults.push({ userId, ok: false, error: err.message });
    }
  }

  return { providers, users: userResults };
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
