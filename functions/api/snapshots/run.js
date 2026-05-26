import { json, error } from '../../_utils.js';
import { runSnapshot } from '../../_snapshot.js';

// POST /api/snapshots/run — manually trigger a snapshot for the current user.
// Used for backfilling, testing, and the "📸 Tạo snapshot ngay" button.
export async function onRequestPost({ env, data }) {
  try {
    const result = await runSnapshot(env, { userId: data.user.id });
    return json(result, 200);
  } catch (err) {
    return error(err.message, 500);
  }
}
