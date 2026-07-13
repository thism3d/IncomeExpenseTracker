const jwt = require('jsonwebtoken');
const { query } = require('../utils/db');

// Routes that must keep working while maintenance is on, so an admin can turn it
// back off and every client can still read the maintenance banner.
const ALLOWED_PREFIXES = ['/api/app', '/api/admin', '/api/auth/login', '/api/health'];

let cache = { value: null, at: 0 };
const CACHE_MS = 8000;

const invalidateMaintenanceCache = () => {
    cache = { value: null, at: 0 };
};

// The flag is only in force inside its scheduled window, when one is set.
const resolveMaintenance = (settings) => {
    const active = settings.maintenance_active === 'true';
    const start = settings.maintenance_start ? new Date(settings.maintenance_start) : null;
    const end = settings.maintenance_end ? new Date(settings.maintenance_end) : null;
    const now = new Date();

    let inWindow = active;
    if (active && start && now < start) inWindow = false;
    if (active && end && now > end) inWindow = false;

    return {
        active: inWindow,
        message: settings.maintenance_message || 'We are performing scheduled maintenance.',
        start: settings.maintenance_start || null,
        end: settings.maintenance_end || null,
    };
};

const getMaintenance = async () => {
    if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
    const result = await query(
        `SELECT key, value FROM settings WHERE key LIKE 'maintenance_%'`
    );
    const settings = Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
    const resolved = resolveMaintenance(settings);
    cache = { value: resolved, at: Date.now() };
    return resolved;
};

const maintenanceGuard = async (req, res, next) => {
    try {
        if (ALLOWED_PREFIXES.some((p) => req.path.startsWith(p))) return next();

        const state = await getMaintenance();
        if (!state.active) return next();

        // Admins work through the outage.
        const header = req.headers.authorization;
        if (header && header.startsWith('Bearer ')) {
            try {
                const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
                if (decoded.isAdmin) return next();
            } catch (_) { /* fall through to the 503 */ }
        }

        return res.status(503).json({
            success: false,
            error: { code: 'MAINTENANCE', message: state.message, start: state.start, end: state.end },
        });
    } catch (err) {
        return next(err);
    }
};

module.exports = { maintenanceGuard, getMaintenance, resolveMaintenance, invalidateMaintenanceCache };
