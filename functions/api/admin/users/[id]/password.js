import { hashPassword } from '../../../../_auth.js';
import { json, error, readBody } from '../../../../_utils.js';
import { loadTarget } from '../../_target.js';

// POST { new_password } — set a new password and sign the user out everywhere.
export async function onRequestPost({ env, request, params }) {
  const { user, err } = await loadTarget(env, params.id);
  if (err) return err;
  const { new_password } = await readBody(request);
  if (!new_password || String(new_password).length < 8) {
    return error('Password must be ≥ 8 chars', 400);
  }
  const hash = await hashPassword(new_password);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").bind(hash, user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
  ]);
  return json({ ok: true });
}
