const webpush = require('web-push');
const { query } = require('../utils/db');
const { sendEmail } = require('../utils/email');

/**
 * One place that decides how a notification reaches a user.
 *
 * Every notification lands in the database and is pushed over the WebSocket to any
 * open session. On top of that:
 *
 *   web push  — reaches a browser whose tab is closed. Needs VAPID keys.
 *   email     — for the ones the user would be annoyed to miss.
 *
 * Which types get an email is a deliberate short list, not "everything": a mailbox
 * full of routine confirmations is a mailbox nobody reads, and then the one that
 * mattered gets missed too.
 */

const EMAIL_WORTHY = new Set([
    'BUDGET_ALERT',      // you are about to overspend
    'REMINDER',          // you asked to be reminded
    'ADMIN_BROADCAST',   // the operator is telling you something
    'SECURITY',          // password changed, new sign-in, account suspended
    'MONTHLY_SUMMARY',   // the statement, with the PDF attached
]);

let vapidReady = false;

const initPush = () => {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.log('Web push disabled (no VAPID keys) — in-app + email still work');
        return false;
    }
    webpush.setVapidDetails(
        VAPID_SUBJECT || 'mailto:support@sisirbindu.site',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
    vapidReady = true;
    console.log('Web push enabled');
    return true;
};

/** Fan a push out to every browser this user has subscribed. */
const sendPush = async (userId, payload) => {
    if (!vapidReady) return 0;

    const subs = await query(
        `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
        [userId]
    );

    let delivered = 0;
    for (const sub of subs.rows) {
        try {
            await webpush.sendNotification(
                {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth },
                },
                JSON.stringify(payload)
            );
            delivered += 1;
        } catch (err) {
            // 404/410 mean the browser threw the subscription away (cleared data,
            // uninstalled the PWA). Keeping it would retry forever.
            if (err.statusCode === 404 || err.statusCode === 410) {
                await query(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]);
            } else {
                console.error('Push failed:', err.statusCode, err.body || err.message);
            }
        }
    }
    return delivered;
};

const emailShell = (title, body, footer) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f4f6f8;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(16,24,40,.08);">
    <div style="background:linear-gradient(135deg,#0E7C66,#0A5C4C);padding:26px 32px;">
      <h1 style="margin:0;color:#fff;font-size:19px;letter-spacing:.5px;">SISIRBINDU TRACKERAPP</h1>
    </div>
    <div style="padding:30px 32px;">
      <h2 style="margin:0 0 14px;font-size:18px;color:#101828;">${title}</h2>
      ${body}
    </div>
    <div style="padding:18px 32px;background:#f9fafb;border-top:1px solid #eaecf0;">
      <p style="margin:0;font-size:12px;color:#98a2b3;">
        ${footer || 'You are receiving this because it affects your account. Manage notifications in Settings.'}
      </p>
    </div>
  </div>
</div>`;

/**
 * Record a notification and deliver it everywhere it should go.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.type      SYSTEM | REMINDER | RECURRING | BUDGET_ALERT | ADMIN_BROADCAST | SECURITY | MONTHLY_SUMMARY
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {object} [opts.data]
 * @param {Array}  [opts.attachments]  nodemailer attachments (used for the monthly PDF)
 * @param {boolean}[opts.forceEmail]   email even if the type is not on the list
 */
const notify = async ({
    userId,
    type = 'SYSTEM',
    title,
    message,
    data = null,
    attachments = null,
    forceEmail = false,
}) => {
    // 1. Persist. This is the record of truth — the bell in the app reads it.
    //    MONTHLY_SUMMARY / SECURITY are not in the notification_type enum, so they
    //    are stored as SYSTEM with the real type kept in `data`.
    const enumType = ['SYSTEM', 'REMINDER', 'RECURRING', 'BUDGET_ALERT', 'ADMIN_BROADCAST']
        .includes(type)
        ? type
        : 'SYSTEM';

    const inserted = await query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES ($1, $2::notification_type, $3, $4, $5)
         RETURNING id, type, title, message, data, is_read, created_at`,
        [userId, enumType, title, message, JSON.stringify({ ...(data || {}), kind: type })]
    );
    const row = inserted.rows[0];

    // 2. Any open session, over the socket it already holds.
    global.pushToUser?.(userId, 'notification', {
        id: row.id,
        type: row.type,
        title: row.title,
        message: row.message,
        data: row.data,
        isRead: row.is_read,
        createdAt: row.created_at,
    });

    // 3. Closed browsers.
    await sendPush(userId, {
        id: row.id,
        type,
        title,
        message,
        url: data?.url || '/app',
    }).catch((err) => console.error('sendPush failed:', err.message));

    // 4. Email, for the ones worth interrupting someone over.
    if (process.env.EMAIL_NOTIFICATIONS === 'true' && (forceEmail || EMAIL_WORTHY.has(type))) {
        const user = await query(`SELECT name, email FROM users WHERE id = $1`, [userId]);
        const email = user.rows[0]?.email;

        if (email) {
            const cta = process.env.FRONTEND_URL
                ? `<div style="margin-top:22px;">
                     <a href="${process.env.FRONTEND_URL}/app"
                        style="display:inline-block;background:#0E7C66;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
                       Open SisirBindu
                     </a>
                   </div>`
                : '';

            await sendEmail(
                email,
                title,
                emailShell(
                    title,
                    `<p style="margin:0;font-size:14px;line-height:1.6;color:#475467;">${message}</p>${cta}`
                ),
                attachments
            ).catch((err) => console.error('Notification email failed:', err.message));
        }
    }

    return row;
};

module.exports = { notify, initPush, sendPush, EMAIL_WORTHY };
