import { getSessionUser } from './_auth.js';
import { json, error } from './_utils.js';

const ALWAYS_PUBLIC = new Set([
  '/api/auth/login',
]);

export const onRequest = async (context) => {
  const url = new URL(context.request.url);

  // Non-/api requests pass through (SPA shell + static assets).
  if (!url.pathname.startsWith('/api/')) return context.next();

  // Signup is open only when the env explicitly enables it.
  if (url.pathname === '/api/auth/signup') {
    if (context.env.ALLOW_SIGNUP !== 'true') {
      return error('Signup disabled', 403);
    }
    return context.next();
  }

  if (ALWAYS_PUBLIC.has(url.pathname)) return context.next();

  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'unauthorized' }, 401);

  context.data.user = user;
  return context.next();
};
