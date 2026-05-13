import { json, error, nowISO } from '../_utils.js';

const TABLES = [
  'members',
  'platforms',
  'assets',
  'transactions',
  'price_history',
];

// GET /api/export — dump all tables as JSON
export async function onRequestGet({ env }) {
  try {
    const data = {};
    for (const t of TABLES) {
      const res = await env.DB.prepare(`SELECT * FROM ${t}`).all();
      data[t] = res.results || [];
    }
    return json({ version: 1, exported_at: nowISO(), data });
  } catch (err) {
    return error(err.message, 500);
  }
}
