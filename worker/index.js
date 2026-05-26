import { runSnapshot } from '../functions/_snapshot.js';
import { fetchAllProviders } from '../functions/api/_providers.js';
import { sendDailyNotificationForUser } from '../functions/_push.js';

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

async function dailyNotifyAllUsers(env) {
  const { results: users } = await env.DB.prepare('SELECT id FROM users').all();
  const out = [];
  for (const { id: userId } of (users || [])) {
    try {
      const r = await sendDailyNotificationForUser(env, userId);
      out.push({ userId, ok: true, ...r });
    } catch (err) {
      out.push({ userId, ok: false, error: err.message });
    }
  }
  return { users: out };
}

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === '0 1 * * *') {
      ctx.waitUntil(dailyNotifyAllUsers(env));
    } else {
      ctx.waitUntil(refreshAndSnapshot(env));
    }
  },
  // Manual triggers for local testing:
  //   wrangler dev --config worker/wrangler.toml
  //   curl -X POST http://localhost:8787/          → snapshot + price refresh
  //   curl -X POST http://localhost:8787/notify    → daily push notification
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('POST / for snapshot, POST /notify for push', { status: 405 });
    }
    const url = new URL(request.url);
    const result = url.pathname === '/notify'
      ? await dailyNotifyAllUsers(env)
      : await refreshAndSnapshot(env);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
