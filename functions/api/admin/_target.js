import { isSuperAdmin } from '../../_auth.js';
import { error } from '../../_utils.js';

// Loads the user an admin action targets. Super admins (including the caller)
// are off-limits so an admin can't lock themselves or a peer out.
export async function loadTarget(env, id) {
  if (!/^\d+$/.test(String(id))) return { err: error('Invalid user id', 400) };
  const user = await env.DB.prepare('SELECT id, email, disabled_at FROM users WHERE id = ?')
    .bind(Number(id)).first();
  if (!user) return { err: error('User not found', 404) };
  if (isSuperAdmin(env, user.email)) return { err: error('Cannot modify a super admin', 403) };
  return { user };
}
