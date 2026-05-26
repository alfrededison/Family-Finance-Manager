import { verifyPassword, createSession, setSessionCookie, DUMMY_PASSWORD_HASH } from '../../_auth.js';
import { error, readBody } from '../../_utils.js';

export async function onRequestPost({ env, request }) {
  try {
    const { email, password } = await readBody(request);
    if (!email || !password) return error('email and password required', 400);

    const row = await env.DB.prepare(
      'SELECT id, email, name, password_hash FROM users WHERE email = ?',
    ).bind(String(email).trim().toLowerCase()).first();

    // Verify against a dummy hash on miss so the timing matches a real verify.
    const stored = row?.password_hash ?? DUMMY_PASSWORD_HASH;
    const ok = await verifyPassword(password, stored);
    if (!row || !ok) return error('Invalid credentials', 401);

    const token = await createSession(env, row.id, request);
    return new Response(JSON.stringify({ id: row.id, email: row.email, name: row.name }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': setSessionCookie(token, request),
      },
    });
  } catch (err) {
    return error(err.message, 500);
  }
}
