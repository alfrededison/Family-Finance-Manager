import { json, error, readBody } from '../../../_utils.js';
import { loadTarget } from '../_target.js';

// PUT { disabled: boolean } — deactivate / reactivate an account.
export async function onRequestPut({ env, request, params }) {
  const { user, err } = await loadTarget(env, params.id);
  if (err) return err;
  const { disabled } = await readBody(request);
  if (typeof disabled !== 'boolean') return error('disabled must be a boolean', 400);
  if (disabled) {
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET disabled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    ]);
  } else {
    await env.DB.prepare("UPDATE users SET disabled_at = NULL, updated_at = datetime('now') WHERE id = ?")
      .bind(user.id).run();
  }
  return json({ ok: true });
}

// DELETE — remove the account and all its data. asset_deltas has no CASCADE
// on assets, so clear it first; everything else cascades from users.
export async function onRequestDelete({ env, params }) {
  const { user, err } = await loadTarget(env, params.id);
  if (err) return err;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM asset_deltas WHERE asset_id IN (SELECT id FROM assets WHERE user_id = ?)').bind(user.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  return json({ ok: true });
}
