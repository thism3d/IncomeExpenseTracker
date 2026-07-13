const jwt = require('jsonwebtoken');
const { query } = require('../utils/db');

const signToken = (userId, isAdmin = false) =>
    jwt.sign({ userId, isAdmin }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRY || '30d',
    });

const authenticate = (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'No token provided' },
        });
    }
    try {
        const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
        req.userId = decoded.userId;
        req.isAdmin = decoded.isAdmin || false;
        return next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
        });
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.isAdmin) {
        return res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Admin access required' },
        });
    }
    return next();
};

// A suspended user's token stays valid until it expires, so check the live row.
//
// This also enforces the mandatory app lock. The Flutter gate that pushes an
// un-locked user to the setup screen is a UI convenience — it is NOT a control.
// Anyone holding the token (a stale client, an older APK, curl) could otherwise
// reach every route without ever setting a PIN, which is exactly the hole a
// web-registered user fell through: they registered in the browser, where nothing
// asks for a lock, then signed in on the phone.
//
// So the server refuses: no configured lock, no data. The only routes that stay
// open are the ones needed to GET a lock configured (/auth/*) and the public app
// config. Admins are exempt — they have no tracker data and never see the phone
// app's lock screen.
const requireActiveUser = async (req, res, next) => {
    try {
        const result = await query(
            `SELECT status, lock_configured, is_admin FROM users WHERE id = $1`,
            [req.userId]
        );
        if (!result.rows.length) {
            return res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Account no longer exists' },
            });
        }

        const user = result.rows[0];

        if (user.status === 'SUSPENDED') {
            return res.status(403).json({
                success: false,
                error: { code: 'SUSPENDED', message: 'Your account has been suspended. Contact support.' },
            });
        }

        if (!user.lock_configured && !user.is_admin) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'LOCK_REQUIRED',
                    message: 'Set up your app lock (PIN, fingerprint or face) before using your account.',
                },
            });
        }

        return next();
    } catch (err) {
        return next(err);
    }
};

module.exports = { signToken, authenticate, requireAdmin, requireActiveUser };
