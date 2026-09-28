import { json } from '../../_utils.js';
import { isSuperAdmin } from '../../_auth.js';

export async function onRequestGet({ env, data }) {
  return json({
    id: data.user.id, email: data.user.email, name: data.user.name,
    is_admin: isSuperAdmin(env, data.user.email),
  });
}
