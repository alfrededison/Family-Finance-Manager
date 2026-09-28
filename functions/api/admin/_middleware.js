import { isSuperAdmin } from '../../_auth.js';
import { error } from '../../_utils.js';

// Runs after the root middleware, so data.user is already set. Also the single
// error boundary for every /api/admin/* handler.
export const onRequest = async ({ env, data, next }) => {
  if (!isSuperAdmin(env, data.user?.email)) return error('Forbidden', 403);
  try {
    return await next();
  } catch (err) {
    return error(err.message || 'Internal error', 500);
  }
};
