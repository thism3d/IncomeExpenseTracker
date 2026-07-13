const { query } = require('./db');
const { sendOtpEmail, sendPasswordResetOtpEmail } = require('./email');
const { sendOtpSMS } = require('./sms');
const { maskEmail, maskPhone } = require('./phone');

const OTP_TTL_MINUTES = 15;
const OTP_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

const generateCode = () => String(Math.floor(100000 + Math.random() * 900000));

const isEmailIdentifier = (identifier) => String(identifier || '').includes('@');

// Issue an OTP for an identifier (canonical phone or email) and deliver it over
// the matching channel. `purpose` namespaces the code so a registration OTP
// can't be replayed against password reset.
const issueOtp = async (identifier, purpose) => {
    const recent = await query(
        `SELECT created_at FROM otp_codes
          WHERE identifier = $1 AND purpose = $2
            AND created_at > NOW() - ($3 * INTERVAL '1 second')
          ORDER BY created_at DESC LIMIT 1`,
        [identifier, purpose, RESEND_COOLDOWN_SECONDS]
    );
    if (recent.rows.length) {
        const waited = Math.ceil((Date.now() - new Date(recent.rows[0].created_at).getTime()) / 1000);
        return { ok: false, code: 'COOLDOWN', retryAfter: Math.max(1, RESEND_COOLDOWN_SECONDS - waited) };
    }

    const code = generateCode();
    const expiry = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // A new code supersedes any outstanding one for the same identifier+purpose.
    await query(`DELETE FROM otp_codes WHERE identifier = $1 AND purpose = $2`, [identifier, purpose]);
    await query(
        `INSERT INTO otp_codes (identifier, purpose, code, expiry) VALUES ($1, $2, $3, $4)`,
        [identifier, purpose, code, expiry]
    );

    const viaEmail = isEmailIdentifier(identifier);
    let delivered;
    if (viaEmail) {
        delivered = purpose === 'password_reset'
            ? await sendPasswordResetOtpEmail(identifier, code)
            : await sendOtpEmail(identifier, code);
    } else {
        delivered = await sendOtpSMS(identifier, code);
    }

    if (!delivered) {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[dev] OTP for ${identifier} (${purpose}): ${code}`);
            return { ok: true, channel: viaEmail ? 'email' : 'sms', destination: viaEmail ? maskEmail(identifier) : maskPhone(identifier), devCode: code };
        }
        return { ok: false, code: 'DELIVERY_FAILED' };
    }

    return {
        ok: true,
        channel: viaEmail ? 'email' : 'sms',
        destination: viaEmail ? maskEmail(identifier) : maskPhone(identifier),
    };
};

// Check a submitted code. Consumes it on success; counts the attempt on failure
// and burns the code once OTP_MAX_ATTEMPTS is reached, so a 6-digit code can't
// be brute-forced.
const verifyOtp = async (identifier, purpose, submitted) => {
    const result = await query(
        `SELECT id, code, attempts, expiry FROM otp_codes
          WHERE identifier = $1 AND purpose = $2
          ORDER BY created_at DESC LIMIT 1`,
        [identifier, purpose]
    );
    const row = result.rows[0];
    if (!row) return { ok: false, code: 'NO_OTP' };

    if (new Date(row.expiry) < new Date()) {
        await query(`DELETE FROM otp_codes WHERE id = $1`, [row.id]);
        return { ok: false, code: 'EXPIRED' };
    }

    if (row.attempts >= OTP_MAX_ATTEMPTS) {
        await query(`DELETE FROM otp_codes WHERE id = $1`, [row.id]);
        return { ok: false, code: 'TOO_MANY_ATTEMPTS' };
    }

    if (row.code !== String(submitted || '').trim()) {
        const updated = await query(
            `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
            [row.id]
        );
        const attempts = updated.rows[0].attempts;
        if (attempts >= OTP_MAX_ATTEMPTS) {
            await query(`DELETE FROM otp_codes WHERE id = $1`, [row.id]);
            return { ok: false, code: 'TOO_MANY_ATTEMPTS' };
        }
        return { ok: false, code: 'INVALID_OTP', attemptsLeft: OTP_MAX_ATTEMPTS - attempts };
    }

    await query(`DELETE FROM otp_codes WHERE identifier = $1 AND purpose = $2`, [identifier, purpose]);
    return { ok: true };
};

// Expired codes are dead weight — clear them out periodically.
const purgeExpiredOtps = async () => {
    const res = await query(`DELETE FROM otp_codes WHERE expiry < NOW() - INTERVAL '1 day'`);
    return res.rowCount;
};

module.exports = {
    OTP_TTL_MINUTES,
    OTP_MAX_ATTEMPTS,
    RESEND_COOLDOWN_SECONDS,
    isEmailIdentifier,
    issueOtp,
    verifyOtp,
    purgeExpiredOtps,
};
