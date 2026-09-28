import { hashPassword, createSession, setSessionCookie, isSuperAdmin } from '../../_auth.js';
import { error, readBody } from '../../_utils.js';

// Signup always requires a single-use invite token minted on the admin page.
export async function onRequestPost({ env, request }) {
  try {
    const { email, name, password, invite } = await readBody(request);
    if (!invite) return error('Signup requires an invite link', 403);
    if (!email || !name || !password) return error('email, name, password required', 400);
    if (String(password).length < 8) return error('Password must be ≥ 8 chars', 400);

    const normEmail = String(email).trim().toLowerCase();
    const normName  = String(name).trim();
    const token     = String(invite);
    // Signup doesn't verify email ownership, so a listed-but-unregistered admin
    // email must not be claimable. Create the account first, then list it.
    if (isSuperAdmin(env, normEmail)) return error('Signup disabled', 403);

    const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(normEmail).first();
    if (exists) return error('Email already registered', 409);

    // Claim the invite atomically so two concurrent signups can't share it.
    const claim = await env.DB.prepare(`
      UPDATE signup_invites SET used_at = datetime('now')
      WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')
    `).bind(token).run();
    if (!claim.meta.changes) return error('Invite link invalid or expired', 403);

    const hash = await hashPassword(password);
    let userId;
    try {
      const res = await env.DB.prepare(
        'INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)',
      ).bind(normEmail, normName, hash).run();
      userId = res.meta.last_row_id;
    } catch (err) {
      // Release the invite so a failed insert doesn't burn it.
      await env.DB.prepare('UPDATE signup_invites SET used_at = NULL WHERE token = ?').bind(token).run();
      throw err;
    }
    await env.DB.prepare('UPDATE signup_invites SET used_by = ? WHERE token = ?').bind(userId, token).run();

    const sid = await createSession(env, userId, request);
    return new Response(JSON.stringify({ id: userId, email: normEmail, name: normName }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': setSessionCookie(sid, request),
      },
    });
  } catch (err) {
    return error(err.message, 500);
  }
}
