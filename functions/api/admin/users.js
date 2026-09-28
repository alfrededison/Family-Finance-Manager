import { isSuperAdmin } from '../../_auth.js';
import { json } from '../../_utils.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`
    SELECT u.id, u.email, u.name, u.created_at, u.disabled_at,
           (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessions,
           (SELECT COUNT(*) FROM assets a WHERE a.user_id = u.id) AS assets
    FROM users u ORDER BY u.id
  `).bind(new Date().toISOString()).all();
  return json(results.map((u) => ({ ...u, is_super_admin: isSuperAdmin(env, u.email) })));
}
