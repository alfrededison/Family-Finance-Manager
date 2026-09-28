import { randomToken } from '../../_auth.js';
import { json } from '../../_utils.js';

const INVITE_DAYS = 7;

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`
    SELECT i.token, i.created_at, i.expires_at, i.used_at,
           i.expires_at <= datetime('now') AS expired,
           u.email AS used_by_email
    FROM signup_invites i LEFT JOIN users u ON u.id = i.used_by
    ORDER BY i.created_at DESC LIMIT 50
  `).all();
  return json(results);
}

// POST — mint a single-use signup token valid for INVITE_DAYS.
export async function onRequestPost({ env, data }) {
  const token = randomToken();
  const row = await env.DB.prepare(`
    INSERT INTO signup_invites (token, created_by, expires_at)
    VALUES (?, ?, datetime('now', '+${INVITE_DAYS} days'))
    RETURNING token, created_at, expires_at
  `).bind(token, data.user.id).first();
  return json(row, 201);
}
