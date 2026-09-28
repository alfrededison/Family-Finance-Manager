import { json } from '../../../_utils.js';

// DELETE — revoke an unused invite. Used ones are kept as a record.
export async function onRequestDelete({ env, params }) {
  await env.DB.prepare('DELETE FROM signup_invites WHERE token = ? AND used_at IS NULL')
    .bind(params.token).run();
  return json({ ok: true });
}
