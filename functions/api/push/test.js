import { json, error } from '../../_utils.js';
import { sendDailyNotificationForUser } from '../../_push.js';

// POST /api/push/test — send a test notification to the current user's subscriptions.
export async function onRequestPost({ env, data }) {
  try {
    const r = await sendDailyNotificationForUser(env, data.user.id, { forceTest: true });
    return json(r);
  } catch (err) {
    return error(err.message, 500);
  }
}
