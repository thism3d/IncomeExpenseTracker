const { query } = require('../utils/db');
const { ok, fail } = require('../utils/respond');

const shape = (n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    data: n.data,
    isRead: n.is_read,
    createdAt: n.created_at,
});

// GET /api/notifications?limit=&offset=&unreadOnly=
const listNotifications = async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const unreadOnly = req.query.unreadOnly === 'true';

    const result = await query(
        `SELECT * FROM notifications
          WHERE user_id = $1 AND ($2 = false OR is_read = false)
          ORDER BY created_at DESC
          LIMIT $3 OFFSET $4`,
        [req.userId, unreadOnly, limit, offset]
    );

    const unread = await query(
        `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND is_read = false`,
        [req.userId]
    );

    return ok(res, {
        notifications: result.rows.map(shape),
        unreadCount: unread.rows[0].n,
        hasMore: result.rows.length === limit,
    });
};

// PUT /api/notifications/:id/read
const markRead = async (req, res) => {
    const updated = await query(
        `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *`,
        [req.params.id, req.userId]
    );
    if (!updated.rows.length) return fail(res, 404, 'NOT_FOUND', 'Notification not found');
    return ok(res, { notification: shape(updated.rows[0]) });
};

// PUT /api/notifications/read-all
const markAllRead = async (req, res) => {
    const updated = await query(
        `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
        [req.userId]
    );
    return ok(res, { marked: updated.rowCount }, 'All notifications marked as read');
};

// DELETE /api/notifications/:id
const deleteNotification = async (req, res) => {
    const deleted = await query(
        `DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id`,
        [req.params.id, req.userId]
    );
    if (!deleted.rows.length) return fail(res, 404, 'NOT_FOUND', 'Notification not found');
    return ok(res, { deleted: true });
};

// POST /api/notifications/subscribe
// The browser's PushSubscription, exactly as `subscription.toJSON()` produces it.
const subscribe = async (req, res) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return fail(res, 400, 'BAD_REQUEST', 'A push endpoint and its keys are required');
    }

    // The endpoint is unique per browser, so re-subscribing (after clearing site
    // data, say) updates the row rather than piling up dead ones.
    await query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint) DO UPDATE
            SET user_id = EXCLUDED.user_id,
                p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth,
                user_agent = EXCLUDED.user_agent`,
        [req.userId, endpoint, keys.p256dh, keys.auth, req.headers['user-agent'] || null]
    );

    return ok(res, { subscribed: true }, 'Browser notifications enabled');
};

// POST /api/notifications/unsubscribe
const unsubscribe = async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) return fail(res, 400, 'BAD_REQUEST', 'endpoint is required');

    await query(
        `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`,
        [endpoint, req.userId]
    );
    return ok(res, { subscribed: false }, 'Browser notifications disabled');
};

module.exports = {
    listNotifications,
    markRead,
    markAllRead,
    deleteNotification,
    subscribe,
    unsubscribe,
};
