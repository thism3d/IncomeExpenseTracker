const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { query } = require('../utils/db');
const { ok, created, fail } = require('../utils/respond');
const { notify } = require('../services/notify');
const { invalidateMaintenanceCache, getMaintenance } = require('../middleware/maintenance');

const showPasswords = () => process.env.SHOW_USER_PASSWORDS === 'true';
const rounds = () => parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;

const audit = (actorId, action, target, detail, ip) =>
    query(
        `INSERT INTO audit_log (actor_id, action, target, detail, ip) VALUES ($1, $2, $3, $4, $5)`,
        [actorId, action, target || null, detail ? JSON.stringify(detail) : null, ip || null]
    ).catch((err) => console.error('audit_log write failed:', err.message));

// ---------------------------------------------------------------- dashboard

// GET /api/admin/stats
const getStats = async (req, res) => {
    const [users, activity, topCategories, growth] = await Promise.all([
        query(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
                    COUNT(*) FILTER (WHERE status = 'SUSPENDED')::int AS suspended,
                    COUNT(*) FILTER (WHERE created_at >= date_trunc('day', NOW()))::int AS new_today,
                    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_30d,
                    COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '7 days')::int AS active_7d,
                    COUNT(*) FILTER (WHERE lock_configured)::int AS lock_configured
               FROM users WHERE is_admin = false`
        ),
        query(
            `SELECT COUNT(*)::int AS transactions,
                    COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'),  0) AS income,
                    COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0) AS expense,
                    (SELECT COUNT(*)::int FROM attachments) AS attachments,
                    (SELECT COALESCE(SUM(size_bytes), 0)::bigint FROM attachments) AS storage_bytes,
                    (SELECT COUNT(*)::int FROM accounts) AS accounts
               FROM transactions`
        ),
        query(
            `SELECT c.name, COUNT(*)::int AS count, COALESCE(SUM(t.amount), 0) AS total
               FROM transactions t JOIN categories c ON c.id = t.category_id
              WHERE t.type = 'EXPENSE' AND t.occurred_at >= NOW() - INTERVAL '30 days'
              GROUP BY c.name ORDER BY total DESC LIMIT 8`
        ),
        query(
            `SELECT d::date AS day,
                    (SELECT COUNT(*)::int FROM users u
                      WHERE u.is_admin = false AND date_trunc('day', u.created_at) = d) AS signups,
                    (SELECT COUNT(*)::int FROM transactions t
                      WHERE date_trunc('day', t.created_at) = d) AS transactions
               FROM generate_series(
                    date_trunc('day', NOW() - INTERVAL '29 days'),
                    date_trunc('day', NOW()),
                    '1 day'::interval) AS d
              ORDER BY d ASC`
        ),
    ]);

    const a = activity.rows[0];
    return ok(res, {
        users: users.rows[0],
        activity: {
            transactions: a.transactions,
            income: Number(a.income),
            expense: Number(a.expense),
            attachments: a.attachments,
            storageBytes: Number(a.storage_bytes),
            accounts: a.accounts,
        },
        topCategories: topCategories.rows.map((r) => ({
            name: r.name, count: r.count, total: Number(r.total),
        })),
        growth: growth.rows.map((r) => ({
            date: r.day, signups: r.signups, transactions: r.transactions,
        })),
    });
};

// ------------------------------------------------------------------- users

// GET /api/admin/users?search=&status=&limit=&offset=
const listUsers = async (req, res) => {
    const search = (req.query.search || '').trim();
    const status = req.query.status || '';
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const offset = parseInt(req.query.offset, 10) || 0;

    // password_plain only exists to satisfy SHOW_USER_PASSWORDS. With the flag
    // off, the column is never selected and never populated.
    const passwordCol = showPasswords() ? 'u.password_plain,' : '';

    const result = await query(
        `SELECT u.id, u.name, u.email, u.phone, u.status, u.is_admin,
                u.email_verified, u.phone_verified, u.lock_configured, u.biometric_enabled,
                u.currency, u.created_at, u.last_login_at, ${passwordCol}
                (SELECT COUNT(*)::int FROM transactions t WHERE t.user_id = u.id) AS transaction_count,
                (SELECT COUNT(*)::int FROM accounts a WHERE a.user_id = u.id) AS account_count,
                (SELECT COALESCE(SUM(size_bytes), 0)::bigint FROM attachments at WHERE at.user_id = u.id) AS storage_bytes,
                (SELECT COALESCE(SUM(amount), 0) FROM transactions t WHERE t.user_id = u.id AND t.type = 'INCOME')  AS total_income,
                (SELECT COALESCE(SUM(amount), 0) FROM transactions t WHERE t.user_id = u.id AND t.type = 'EXPENSE') AS total_expense
           FROM users u
          WHERE ($1 = '' OR u.name ILIKE '%' || $1 || '%'
                         OR u.email ILIKE '%' || $1 || '%'
                         OR u.phone ILIKE '%' || $1 || '%')
            AND ($2 = '' OR u.status = $2::user_status)
          ORDER BY u.created_at DESC
          LIMIT $3 OFFSET $4`,
        [search, status, limit, offset]
    );

    const total = await query(
        `SELECT COUNT(*)::int AS n FROM users u
          WHERE ($1 = '' OR u.name ILIKE '%' || $1 || '%'
                         OR u.email ILIKE '%' || $1 || '%'
                         OR u.phone ILIKE '%' || $1 || '%')
            AND ($2 = '' OR u.status = $2::user_status)`,
        [search, status]
    );

    return ok(res, {
        users: result.rows.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            status: u.status,
            isAdmin: u.is_admin,
            emailVerified: u.email_verified,
            phoneVerified: u.phone_verified,
            lockConfigured: u.lock_configured,
            biometricEnabled: u.biometric_enabled,
            currency: u.currency,
            createdAt: u.created_at,
            lastLoginAt: u.last_login_at,
            transactionCount: u.transaction_count,
            accountCount: u.account_count,
            storageBytes: Number(u.storage_bytes),
            totalIncome: Number(u.total_income),
            totalExpense: Number(u.total_expense),
            ...(showPasswords() ? { passwordPlain: u.password_plain || null } : {}),
        })),
        total: total.rows[0].n,
        limit,
        offset,
        passwordsVisible: showPasswords(),
    });
};

// GET /api/admin/users/:id
const getUser = async (req, res) => {
    const passwordCol = showPasswords() ? 'u.password_plain,' : '';
    const result = await query(
        `SELECT u.*, ${passwordCol}
                (SELECT COUNT(*)::int FROM transactions t WHERE t.user_id = u.id) AS transaction_count
           FROM users u WHERE u.id = $1`,
        [req.params.id]
    );
    if (!result.rows.length) return fail(res, 404, 'NOT_FOUND', 'User not found');
    const u = result.rows[0];

    const recent = await query(
        `SELECT t.id, t.type, t.amount, t.occurred_at, t.note, c.name AS category_name
           FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.user_id = $1 ORDER BY t.occurred_at DESC LIMIT 10`,
        [req.params.id]
    );

    return ok(res, {
        user: {
            id: u.id, name: u.name, email: u.email, phone: u.phone,
            status: u.status, isAdmin: u.is_admin,
            emailVerified: u.email_verified, phoneVerified: u.phone_verified,
            lockConfigured: u.lock_configured, biometricEnabled: u.biometric_enabled,
            currency: u.currency, createdAt: u.created_at, lastLoginAt: u.last_login_at,
            transactionCount: u.transaction_count,
            ...(showPasswords() ? { passwordPlain: u.password_plain || null } : {}),
        },
        recentTransactions: recent.rows.map((t) => ({
            id: t.id, type: t.type, amount: Number(t.amount),
            occurredAt: t.occurred_at, note: t.note, categoryName: t.category_name,
        })),
    });
};

// PUT /api/admin/users/:id/status   { status }
const setUserStatus = async (req, res) => {
    const { status } = req.body;
    const updated = await query(
        `UPDATE users SET status = $1::user_status, updated_at = NOW()
          WHERE id = $2 AND is_admin = false
      RETURNING id, name, status`,
        [status, req.params.id]
    );
    if (!updated.rows.length) {
        return fail(res, 404, 'NOT_FOUND', 'User not found, or is an admin (admins cannot be suspended)');
    }

    audit(req.userId, 'user.status', req.params.id, { status }, req.ip);
    global.pushToUser?.(req.params.id, 'account:status', { status });

    return ok(res, { user: updated.rows[0] }, `User ${status === 'ACTIVE' ? 'reactivated' : 'suspended'}`);
};

// PUT /api/admin/users/:id/password   { password }
// The admin sets a new password and is shown it once. When SHOW_USER_PASSWORDS
// is on, it is also persisted so it stays visible in the users table.
const setUserPassword = async (req, res) => {
    const { password } = req.body;
    const hash = await bcrypt.hash(password, rounds());

    const updated = await query(
        `UPDATE users SET password = $1, password_plain = $2, updated_at = NOW()
          WHERE id = $3 RETURNING id, name, email, phone`,
        [hash, showPasswords() ? password : null, req.params.id]
    );
    if (!updated.rows.length) return fail(res, 404, 'NOT_FOUND', 'User not found');

    audit(req.userId, 'user.password', req.params.id, null, req.ip);

    // A password changed out from under someone is exactly the kind of thing they
    // must hear about, by email, immediately.
    notify({
        userId: req.params.id,
        type: 'SECURITY',
        title: 'Your password was changed',
        message:
            'An administrator set a new password on your SisirBindu account. ' +
            'If you did not request this, contact support immediately.',
    }).catch((err) => console.error('Security notification failed:', err.message));

    return ok(res, { user: updated.rows[0], password }, 'Password updated');
};

// DELETE /api/admin/users/:id   — cascades to all of the user's data
const deleteUser = async (req, res) => {
    const target = await query(`SELECT is_admin FROM users WHERE id = $1`, [req.params.id]);
    if (!target.rows.length) return fail(res, 404, 'NOT_FOUND', 'User not found');
    if (target.rows[0].is_admin) return fail(res, 403, 'FORBIDDEN', 'Admin accounts cannot be deleted');

    await query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
    audit(req.userId, 'user.delete', req.params.id, null, req.ip);

    return ok(res, { deleted: true }, 'User and all their data deleted');
};

// ------------------------------------------------------------- maintenance

// GET /api/admin/maintenance
const getMaintenanceState = async (req, res) => {
    const result = await query(`SELECT key, value FROM settings WHERE key LIKE 'maintenance_%'`);
    const settings = Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
    const state = await getMaintenance();
    return ok(res, {
        active: settings.maintenance_active === 'true',
        inEffect: state.active,
        message: settings.maintenance_message || '',
        start: settings.maintenance_start || '',
        end: settings.maintenance_end || '',
        updatedAt: settings.maintenance_updated_at || '',
    });
};

// PUT /api/admin/maintenance   { active, mode, message?, start?, end? }
const setMaintenance = async (req, res) => {
    const { active, mode, message, start, end } = req.body;
    const scheduled = mode === 'scheduled';

    const values = [
        ['maintenance_active', String(!!active)],
        ['maintenance_message', message || 'We are performing scheduled maintenance. Please check back shortly.'],
        ['maintenance_start', scheduled ? (start || '') : ''],
        ['maintenance_end', scheduled ? (end || '') : ''],
        ['maintenance_updated_at', new Date().toISOString()],
    ];
    for (const [key, value] of values) {
        await query(
            `INSERT INTO settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
            [key, value]
        );
    }

    invalidateMaintenanceCache();
    const state = await getMaintenance();

    // Every connected client reacts immediately — no polling delay.
    global.broadcastAll?.('maintenance', state);
    audit(req.userId, 'maintenance.set', null, { active, mode, start, end }, req.ip);

    return ok(res, state, active ? 'Maintenance mode enabled' : 'Maintenance mode disabled');
};

// --------------------------------------------------------------- broadcast

const AUDIENCE_SQL = {
    all:         `is_admin = false`,
    active:      `is_admin = false AND status = 'ACTIVE'`,
    suspended:   `is_admin = false AND status = 'SUSPENDED'`,
    verified:    `is_admin = false AND (email_verified OR phone_verified)`,
    inactive_30d:`is_admin = false AND (last_login_at IS NULL OR last_login_at < NOW() - INTERVAL '30 days')`,
    admins:      `is_admin = true`,
};

const audienceWhere = (audience, segment) => {
    if (audience === 'all') return { sql: AUDIENCE_SQL.all, params: [] };
    if (audience === 'segment') return { sql: AUDIENCE_SQL[segment] || AUDIENCE_SQL.all, params: [] };
    return null; // 'users' — an explicit id list
};

// GET /api/admin/broadcast/preview?audience=&segment=
const previewBroadcast = async (req, res) => {
    const { audience = 'all', segment } = req.query;
    const where = audienceWhere(audience, segment);
    if (!where) return ok(res, { count: 0 });

    const result = await query(`SELECT COUNT(*)::int AS n FROM users WHERE ${where.sql}`);
    return ok(res, { count: result.rows[0].n });
};

// POST /api/admin/broadcast   { audience, segment?, userIds?, title, message }
const sendBroadcast = async (req, res) => {
    const { audience, segment, userIds, title, message } = req.body;

    // Resolve the audience to ids first, then deliver each through notify() — that
    // is the one path that also raises a web push and sends the email. A bulk
    // INSERT would have written the rows and reached only the sockets that happened
    // to be open.
    let recipients;
    if (audience === 'users') {
        if (!userIds || !userIds.length) {
            return fail(res, 400, 'BAD_REQUEST', 'Select at least one user');
        }
        recipients = await query(`SELECT id FROM users WHERE id = ANY($1)`, [userIds]);
    } else {
        const where = audienceWhere(audience, segment);
        recipients = await query(`SELECT id FROM users WHERE ${where.sql}`);
    }

    let sent = 0;
    for (const row of recipients.rows) {
        try {
            await notify({
                userId: row.id,
                type: 'ADMIN_BROADCAST',
                title,
                message,
            });
            sent += 1;
        } catch (err) {
            console.error(`Broadcast to ${row.id} failed:`, err.message);
        }
    }

    audit(req.userId, 'broadcast.send', null, { audience, segment, count: sent }, req.ip);

    return ok(res, { sent }, `Notification sent to ${sent} user(s)`);
};

// ------------------------------------------------------------ app releases

// GET /api/admin/app/versions
const listAppVersions = async (req, res) => {
    const result = await query(`SELECT * FROM app_versions ORDER BY version_code DESC`);
    return ok(res, {
        versions: result.rows.map((v) => ({
            id: v.id,
            versionName: v.version_name,
            versionCode: v.version_code,
            changelog: v.changelog,
            apkUrl: v.apk_url,
            apkFilename: v.apk_filename,
            mandatory: v.mandatory,
            isActive: v.is_active,
            createdAt: v.created_at,
        })),
    });
};

// POST /api/admin/app/version   (multipart: apk, versionName, versionCode, changelog, mandatory)
const createAppVersion = async (req, res) => {
    const { versionName, versionCode, changelog, mandatory } = req.body;
    if (!req.file) return fail(res, 400, 'NO_FILE', 'An APK file is required');
    if (!versionName || !versionCode) {
        return fail(res, 400, 'BAD_REQUEST', 'versionName and versionCode are required');
    }

    const code = parseInt(versionCode, 10);
    if (!Number.isInteger(code) || code < 1) {
        return fail(res, 400, 'BAD_REQUEST', 'versionCode must be a positive integer');
    }

    const clash = await query(`SELECT id FROM app_versions WHERE version_code = $1`, [code]);
    if (clash.rows.length) {
        return fail(res, 409, 'DUPLICATE', `Version code ${code} has already been published`);
    }

    const dir = global.APK_DOWNLOADS_DIR;
    fs.mkdirSync(dir, { recursive: true });

    const filename = `sisirbindu-v${code}.apk`;
    fs.writeFileSync(path.join(dir, filename), req.file.buffer);
    // Also keep a stable name, so a QR/direct link never has to change.
    fs.writeFileSync(path.join(dir, 'sisirbindu.apk'), req.file.buffer);

    // Store the URL relative to the API origin — a dev upload must not pin a
    // localhost host into a row every client will read.
    const apkUrl = `/downloads/${filename}`;

    const inserted = await query(
        `INSERT INTO app_versions (version_name, version_code, changelog, apk_filename, apk_url, mandatory, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING *`,
        [versionName, code, changelog || null, filename, apkUrl, mandatory === 'true' || mandatory === true]
    );

    const v = inserted.rows[0];
    global.broadcastAll?.('app_update', {
        versionName: v.version_name,
        versionCode: v.version_code,
        changelog: v.changelog,
        apkUrl: v.apk_url,
        mandatory: v.mandatory,
    });
    audit(req.userId, 'app.release', null, { versionName, versionCode: code }, req.ip);

    return created(res, {
        version: {
            id: v.id, versionName: v.version_name, versionCode: v.version_code,
            changelog: v.changelog, apkUrl: v.apk_url, mandatory: v.mandatory, isActive: v.is_active,
        },
    }, `Version ${versionName} published`);
};

// PUT /api/admin/app/versions/:id/active   { isActive }
const setAppVersionActive = async (req, res) => {
    const updated = await query(
        `UPDATE app_versions SET is_active = $1 WHERE id = $2 RETURNING *`,
        [!!req.body.isActive, req.params.id]
    );
    if (!updated.rows.length) return fail(res, 404, 'NOT_FOUND', 'Version not found');
    return ok(res, { version: updated.rows[0] }, 'Version updated');
};

// DELETE /api/admin/app/versions/:id
const deleteAppVersion = async (req, res) => {
    const deleted = await query(
        `DELETE FROM app_versions WHERE id = $1 RETURNING apk_filename`,
        [req.params.id]
    );
    if (!deleted.rows.length) return fail(res, 404, 'NOT_FOUND', 'Version not found');

    const filename = deleted.rows[0].apk_filename;
    if (filename) {
        fs.unlink(path.join(global.APK_DOWNLOADS_DIR, filename), () => {});
    }
    audit(req.userId, 'app.release.delete', req.params.id, null, req.ip);

    return ok(res, { deleted: true }, 'Version deleted');
};

// -------------------------------------------------------------- audit log

// GET /api/admin/audit?limit=&offset=
const listAuditLog = async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    const result = await query(
        `SELECT l.*, u.name AS actor_name, u.email AS actor_email
           FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id
          ORDER BY l.created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
    );

    return ok(res, {
        entries: result.rows.map((r) => ({
            id: r.id,
            action: r.action,
            target: r.target,
            detail: r.detail,
            ip: r.ip,
            actor: r.actor_id ? { id: r.actor_id, name: r.actor_name, email: r.actor_email } : null,
            createdAt: r.created_at,
        })),
    });
};

// -------------------------------------------------------------- settings

// GET /api/admin/settings
const getSettings = async (req, res) => {
    const result = await query(`SELECT key, value, updated_at FROM settings ORDER BY key ASC`);
    return ok(res, { settings: result.rows });
};

// PUT /api/admin/settings   { key, value }
const updateSetting = async (req, res) => {
    const { key, value } = req.body;
    if (!key) return fail(res, 400, 'BAD_REQUEST', 'key is required');

    await query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, String(value ?? '')]
    );
    if (key.startsWith('maintenance_')) invalidateMaintenanceCache();

    audit(req.userId, 'setting.update', key, { value }, req.ip);
    return ok(res, { key, value }, 'Setting saved');
};

module.exports = {
    getStats,
    listUsers,
    getUser,
    setUserStatus,
    setUserPassword,
    deleteUser,
    getMaintenanceState,
    setMaintenance,
    previewBroadcast,
    sendBroadcast,
    listAppVersions,
    createAppVersion,
    setAppVersionActive,
    deleteAppVersion,
    listAuditLog,
    getSettings,
    updateSetting,
};
