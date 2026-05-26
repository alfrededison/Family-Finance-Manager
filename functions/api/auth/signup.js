import { hashPassword, createSession, setSessionCookie } from '../../_auth.js';
import { error, readBody } from '../../_utils.js';

export async function onRequestPost({ env, request }) {
  try {
    const { email, name, password } = await readBody(request);
    if (!email || !name || !password) return error('email, name, password required', 400);
    if (String(password).length < 8) return error('Password must be ≥ 8 chars', 400);

    const normEmail = String(email).trim().toLowerCase();
    const normName  = String(name).trim();

    const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(normEmail).first();
    if (exists) return error('Email already registered', 409);

    const hash = await hashPassword(password);
    const res = await env.DB.prepare(
      'INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)',
    ).bind(normEmail, normName, hash).run();
    const userId = res.meta.last_row_id;

    const token = await createSession(env, userId, request);
    return new Response(JSON.stringify({ id: userId, email: normEmail, name: normName }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': setSessionCookie(token, request),
      },
    });
  } catch (err) {
    return error(err.message, 500);
  }
}
