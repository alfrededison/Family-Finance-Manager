import { destroySession, readSessionCookie, clearSessionCookie } from '../../_auth.js';

export async function onRequestPost({ env, request }) {
  await destroySession(env, readSessionCookie(request));
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': clearSessionCookie(request),
    },
  });
}
