const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../utils/db');
const { signToken } = require('../middleware/auth');
const { ok, created, fail } = require('../utils/respond');
const { seedUserDefaults } = require('../utils/presets');
const { issueOtp, verifyOtp, isEmailIdentifier } = require('../utils/otp');
const { sendWelcomeEmail } = require('../utils/email');
const { notify } = require('../services/notify');
const {
    buildCanonicalPhone,
    matchCandidates,
    isValidBdMobile,
    maskEmail,
    maskPhone,
} = require('../utils/phone');

const rounds = () => parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
const showPasswords = () => process.env.SHOW_USER_PASSWORDS === 'true';

// Resolve whatever the client typed into a canonical identifier we can store,
// match on, and send an OTP to. Email stays as-is (lowercased); a phone becomes
// 8801XXXXXXXXX.
const canonicalizeIdentifier = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return { error: 'Email or phone number is required' };

    if (isEmailIdentifier(value)) {
        const email = value.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Enter a valid email address' };
        return { kind: 'email', identifier: email };
    }

    if (!isValidBdMobile(value)) {
        return { error: 'Enter a valid Bangladeshi mobile number (e.g. 01712345678)' };
    }
    const canonical = buildCanonicalPhone(value);
    return { kind: 'phone', identifier: canonical.phone, canonical };
};

const publicUser = (u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    avatar: u.avatar,
    currency: u.currency,
    locale: u.locale,
    theme: u.theme,
    emailVerified: u.email_verified,
    phoneVerified: u.phone_verified,
    lockConfigured: u.lock_configured,
    biometricEnabled: u.biometric_enabled,
    hasPin: !!u.pin_hash,
    isAdmin: u.is_admin,
    status: u.status,
    createdAt: u.created_at,
});

const findByIdentifier = async (kind, identifier) => {
    if (kind === 'email') {
        const r = await query(`SELECT * FROM users WHERE email = $1`, [identifier]);
        return r.rows[0] || null;
    }
    const r = await query(`SELECT * FROM users WHERE phone = ANY($1)`, [matchCandidates(identifier)]);
    return r.rows[0] || null;
};

// ---------------------------------------------------------------- registration
//
// Registration is a three-step flow (README): send OTP -> verify OTP -> set
// password. The user row is only created at set-password, so an unverified
// identifier never occupies the unique email/phone slot.

// POST /api/auth/register/send-otp   { identifier }
const registerSendOtp = async (req, res) => {
    const resolved = canonicalizeIdentifier(req.body.identifier);
    if (resolved.error) return fail(res, 400, 'BAD_REQUEST', resolved.error);

    const existing = await findByIdentifier(resolved.kind, resolved.identifier);
    if (existing && existing.password) {
        return fail(res, 409, 'ALREADY_REGISTERED',
            resolved.kind === 'email'
                ? 'An account with this email already exists. Please log in.'
                : 'An account with this phone number already exists. Please log in.');
    }

    const sent = await issueOtp(resolved.identifier, 'register');
    if (!sent.ok) {
        if (sent.code === 'COOLDOWN') {
            return fail(res, 429, 'COOLDOWN', `Please wait ${sent.retryAfter}s before requesting another code.`, { retryAfter: sent.retryAfter });
        }
        return fail(res, 500, 'DELIVERY_FAILED', 'Could not send the verification code. Please try again.');
    }

    return ok(res, {
        identifier: resolved.identifier,
        channel: sent.channel,
        destination: sent.destination,
        ...(sent.devCode ? { devCode: sent.devCode } : {}),
    }, 'Verification code sent');
};

// POST /api/auth/register/verify-otp   { identifier, code }
// Returns a short-lived verification ticket the set-password step must present,
// so a caller can't set a password for an identifier they never verified.
const registerVerifyOtp = async (req, res) => {
    const resolved = canonicalizeIdentifier(req.body.identifier);
    if (resolved.error) return fail(res, 400, 'BAD_REQUEST', resolved.error);

    const result = await verifyOtp(resolved.identifier, 'register', req.body.code);
    if (!result.ok) {
        const messages = {
            NO_OTP: 'No verification code was requested. Please request a new one.',
            EXPIRED: 'This code has expired. Please request a new one.',
            TOO_MANY_ATTEMPTS: 'Too many incorrect attempts. Please request a new code.',
            INVALID_OTP: 'Incorrect code. Please check and try again.',
        };
        return fail(res, 400, result.code, messages[result.code] || 'Verification failed',
            result.attemptsLeft !== undefined ? { attemptsLeft: result.attemptsLeft } : {});
    }

    // 15-minute ticket, scoped to this identifier and this step only.
    const jwt = require('jsonwebtoken');
    const ticket = jwt.sign(
        { identifier: resolved.identifier, kind: resolved.kind, scope: 'register' },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
    );

    return ok(res, { identifier: resolved.identifier, ticket }, 'Verified');
};

// POST /api/auth/register/set-password   { ticket, name, password }
const registerSetPassword = async (req, res) => {
    const jwt = require('jsonwebtoken');
    let claim;
    try {
        claim = jwt.verify(req.body.ticket, process.env.JWT_SECRET);
    } catch (_) {
        return fail(res, 401, 'INVALID_TICKET', 'Your verification expired. Please start again.');
    }
    if (claim.scope !== 'register') {
        return fail(res, 401, 'INVALID_TICKET', 'Your verification expired. Please start again.');
    }

    const { identifier, kind } = claim;
    const { name, password } = req.body;

    const existing = await findByIdentifier(kind, identifier);
    if (existing && existing.password) {
        return fail(res, 409, 'ALREADY_REGISTERED', 'This account already exists. Please log in.');
    }

    const hash = await bcrypt.hash(password, rounds());
    const plain = showPasswords() ? password : null;

    const user = await withTransaction(async (client) => {
        const canonical = kind === 'phone' ? buildCanonicalPhone(identifier) : null;
        const inserted = await client.query(
            `INSERT INTO users (name, email, phone, dial_code, national_number,
                                password, password_plain, email_verified, phone_verified)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                name.trim(),
                kind === 'email' ? identifier : null,
                canonical ? canonical.phone : null,
                canonical ? canonical.dialCode : null,
                canonical ? canonical.nationalNumber : null,
                hash,
                plain,
                kind === 'email',
                kind === 'phone',
            ]
        );
        const row = inserted.rows[0];
        // Every user starts with the README's preset categories, payment methods
        // and one default "Personal" account.
        await seedUserDefaults(client, row.id);
        return row;
    });

    if (user.email) sendWelcomeEmail(user.email, user.name).catch(() => {});

    return created(res, {
        user: publicUser(user),
        token: signToken(user.id, user.is_admin),
    }, 'Account created');
};

// ----------------------------------------------------------------------- login

// POST /api/auth/login   { identifier, password }
const login = async (req, res) => {
    const resolved = canonicalizeIdentifier(req.body.identifier);
    if (resolved.error) return fail(res, 400, 'BAD_REQUEST', resolved.error);

    const user = await findByIdentifier(resolved.kind, resolved.identifier);
    // Same message for "no such user" and "wrong password" — don't leak which.
    const invalid = () => fail(res, 401, 'INVALID_CREDENTIALS', 'Incorrect email/phone or password');

    if (!user || !user.password) return invalid();
    if (!(await bcrypt.compare(req.body.password, user.password))) return invalid();
    if (user.status === 'SUSPENDED') {
        return fail(res, 403, 'SUSPENDED', 'Your account has been suspended. Contact support.');
    }

    await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    return ok(res, {
        user: publicUser(user),
        token: signToken(user.id, user.is_admin),
    }, 'Signed in');
};

// ------------------------------------------------------------ forgot password

// POST /api/auth/forgot-password   { identifier }
const forgotPassword = async (req, res) => {
    const resolved = canonicalizeIdentifier(req.body.identifier);
    if (resolved.error) return fail(res, 400, 'BAD_REQUEST', resolved.error);

    const user = await findByIdentifier(resolved.kind, resolved.identifier);

    // Don't reveal whether the account exists — but we can't send a code to
    // nothing, so shape the response identically either way.
    if (!user) {
        return ok(res, {
            identifier: resolved.identifier,
            channel: resolved.kind === 'email' ? 'email' : 'sms',
            destination: resolved.kind === 'email' ? maskEmail(resolved.identifier) : maskPhone(resolved.identifier),
        }, 'If an account exists, a reset code has been sent');
    }

    const sent = await issueOtp(resolved.identifier, 'password_reset');
    if (!sent.ok) {
        if (sent.code === 'COOLDOWN') {
            return fail(res, 429, 'COOLDOWN', `Please wait ${sent.retryAfter}s before requesting another code.`, { retryAfter: sent.retryAfter });
        }
        return fail(res, 500, 'DELIVERY_FAILED', 'Could not send the reset code. Please try again.');
    }

    return ok(res, {
        identifier: resolved.identifier,
        channel: sent.channel,
        destination: sent.destination,
        ...(sent.devCode ? { devCode: sent.devCode } : {}),
    }, 'If an account exists, a reset code has been sent');
};

// POST /api/auth/reset-password   { identifier, code, password }
// Verifying the code and setting the new password is one step, so a verified
// code can't be left dangling.
const resetPassword = async (req, res) => {
    const resolved = canonicalizeIdentifier(req.body.identifier);
    if (resolved.error) return fail(res, 400, 'BAD_REQUEST', resolved.error);

    const result = await verifyOtp(resolved.identifier, 'password_reset', req.body.code);
    if (!result.ok) {
        const messages = {
            NO_OTP: 'No reset code was requested. Please request a new one.',
            EXPIRED: 'This code has expired. Please request a new one.',
            TOO_MANY_ATTEMPTS: 'Too many incorrect attempts. Please request a new code.',
            INVALID_OTP: 'Incorrect code. Please check and try again.',
        };
        return fail(res, 400, result.code, messages[result.code] || 'Verification failed',
            result.attemptsLeft !== undefined ? { attemptsLeft: result.attemptsLeft } : {});
    }

    const user = await findByIdentifier(resolved.kind, resolved.identifier);
    if (!user) return fail(res, 404, 'NOT_FOUND', 'No account found for this identifier');

    const hash = await bcrypt.hash(req.body.password, rounds());
    const plain = showPasswords() ? req.body.password : null;

    const updated = await query(
        `UPDATE users SET password = $1, password_plain = $2, updated_at = NOW()
          WHERE id = $3 RETURNING *`,
        [hash, plain, user.id]
    );

    return ok(res, {
        user: publicUser(updated.rows[0]),
        token: signToken(user.id, user.is_admin),
    }, 'Password updated');
};

// -------------------------------------------------------------- app lock (PIN)
//
// The README makes lock setup mandatory: after registering, the user must enable
// a device biometric or set an app PIN before reaching the home screen. The PIN
// is the fallback that always works, so it is what the server stores; biometric
// unlock is verified on-device and only recorded here as a flag.

// POST /api/auth/lock/setup   { pin, biometricEnabled }
const setupLock = async (req, res) => {
    const { pin, biometricEnabled } = req.body;
    const hash = await bcrypt.hash(pin, rounds());

    const updated = await query(
        `UPDATE users
            SET pin_hash = $1, biometric_enabled = $2, lock_configured = true, updated_at = NOW()
          WHERE id = $3
      RETURNING *`,
        [hash, !!biometricEnabled, req.userId]
    );
    if (!updated.rows.length) return fail(res, 404, 'NOT_FOUND', 'User not found');

    return ok(res, { user: publicUser(updated.rows[0]) }, 'App lock enabled');
};

// POST /api/auth/lock/verify-pin   { pin }
const verifyPin = async (req, res) => {
    const result = await query(`SELECT pin_hash FROM users WHERE id = $1`, [req.userId]);
    const hash = result.rows[0]?.pin_hash;
    if (!hash) return fail(res, 400, 'NO_PIN', 'No PIN is set for this account');

    const match = await bcrypt.compare(req.body.pin, hash);
    if (!match) return fail(res, 401, 'INVALID_PIN', 'Incorrect PIN');

    return ok(res, { verified: true });
};

// PUT /api/auth/lock   { currentPin?, pin?, biometricEnabled? }
const updateLock = async (req, res) => {
    const { currentPin, pin, biometricEnabled } = req.body;
    const result = await query(`SELECT * FROM users WHERE id = $1`, [req.userId]);
    const user = result.rows[0];
    if (!user) return fail(res, 404, 'NOT_FOUND', 'User not found');

    // Changing the PIN requires proving you know the old one.
    if (pin) {
        if (!user.pin_hash) return fail(res, 400, 'NO_PIN', 'No PIN is set for this account');
        if (!currentPin || !(await bcrypt.compare(currentPin, user.pin_hash))) {
            return fail(res, 401, 'INVALID_PIN', 'Current PIN is incorrect');
        }
    }

    const updated = await query(
        `UPDATE users
            SET pin_hash = COALESCE($1, pin_hash),
                biometric_enabled = COALESCE($2, biometric_enabled),
                updated_at = NOW()
          WHERE id = $3
      RETURNING *`,
        [
            pin ? await bcrypt.hash(pin, rounds()) : null,
            biometricEnabled === undefined ? null : !!biometricEnabled,
            req.userId,
        ]
    );

    return ok(res, { user: publicUser(updated.rows[0]) }, 'App lock updated');
};

// ------------------------------------------------------------------------- me

// GET /api/auth/me
const me = async (req, res) => {
    const result = await query(`SELECT * FROM users WHERE id = $1`, [req.userId]);
    if (!result.rows.length) return fail(res, 404, 'NOT_FOUND', 'User not found');
    return ok(res, { user: publicUser(result.rows[0]) });
};

// PUT /api/auth/me   { name?, avatar?, currency?, locale?, theme? }
const updateProfile = async (req, res) => {
    const { name, avatar, currency, locale, theme } = req.body;
    const result = await query(
        `UPDATE users
            SET name = COALESCE($1, name),
                avatar = COALESCE($2, avatar),
                currency = COALESCE($3, currency),
                locale = COALESCE($4, locale),
                theme = COALESCE($5, theme),
                updated_at = NOW()
          WHERE id = $6
      RETURNING *`,
        [name?.trim() || null, avatar ?? null, currency || null, locale || null, theme || null, req.userId]
    );
    if (!result.rows.length) return fail(res, 404, 'NOT_FOUND', 'User not found');
    return ok(res, { user: publicUser(result.rows[0]) }, 'Profile updated');
};

// PUT /api/auth/password   { currentPassword, password }
const changePassword = async (req, res) => {
    const result = await query(`SELECT password FROM users WHERE id = $1`, [req.userId]);
    const current = result.rows[0]?.password;
    if (!current) return fail(res, 404, 'NOT_FOUND', 'User not found');

    if (!(await bcrypt.compare(req.body.currentPassword, current))) {
        return fail(res, 401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
    }

    const hash = await bcrypt.hash(req.body.password, rounds());
    const plain = showPasswords() ? req.body.password : null;
    await query(
        `UPDATE users SET password = $1, password_plain = $2, updated_at = NOW() WHERE id = $3`,
        [hash, plain, req.userId]
    );

    // If this wasn't them, the email is how they find out.
    notify({
        userId: req.userId,
        type: 'SECURITY',
        title: 'Your password was changed',
        message:
            'The password on your SisirBindu account was just changed. ' +
            'If this was not you, reset it immediately and contact support.',
    }).catch((err) => console.error('Security notification failed:', err.message));

    return ok(res, { changed: true }, 'Password updated');
};

module.exports = {
    publicUser,
    registerSendOtp,
    registerVerifyOtp,
    registerSetPassword,
    login,
    forgotPassword,
    resetPassword,
    setupLock,
    verifyPin,
    updateLock,
    me,
    updateProfile,
    changePassword,
};
