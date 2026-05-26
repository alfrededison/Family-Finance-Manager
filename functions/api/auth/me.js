import { json } from '../../_utils.js';

export async function onRequestGet({ data }) {
  return json({ id: data.user.id, email: data.user.email, name: data.user.name });
}
