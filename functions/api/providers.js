import { json, error } from '../_utils.js';
import { PROVIDERS } from './_providers.js';

// GET /api/providers — static list of available market data providers
export async function onRequestGet() {
  try {
    const list = Object.values(PROVIDERS).map(({ id, name, subtypes }) => ({ id, name, subtypes }));
    return json(list);
  } catch (err) {
    return error(err.message, 500);
  }
}
