import { hashPassword, verifyPassword } from '../../_auth.js';
import { json, error, readBody } from '../../_utils.js';

export async function onRequestPost({ env, request, data }) {
  try {
    const { current_password, new_password } = await readBody(request);
    if (!new_password || String(new_password).length < 8) {
      return error('Password must be ≥ 8 chars', 400);
    }
    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(data.user.id).first();
    if (!row || !(await verifyPassword(current_password || '', row.password_hash))) {
      return error('Wrong current password', 401);
    }
    const newHash = await hashPassword(new_password);
    await env.DB.prepare(
      "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
    ).bind(newHash, data.user.id).run();
    // Invalidate every other session for this user.
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?')
      .bind(data.user.id, data.user.sessionId).run();
    return json({ ok: true });
  } catch (err) {
    return error(err.message, 500);
  }
}
