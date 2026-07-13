// Phone normalization — the single source of truth for how numbers are stored
// and matched across register / login / forgot-password / OTP.
//
// Storage model (users table):
//   dial_code       '880'
//   national_number '1714526039'   (no leading 0, no country code)
//   phone           '8801714526039' (canonical; what we send OTPs to and match on)
//
// Per the README, a BD user may type any of:
//   +8801714526039 / 8801714526039 / 01714526039 / 1714526039
// and all four must resolve to the same stored phone, 8801714526039.

const BD_DIAL = '880';

const digitsOnly = (v) => String(v || '').replace(/\D/g, '');

const normalizeDialCode = (dialCode) => digitsOnly(dialCode);

// Build the canonical parts from whatever the user typed plus a dial code
// (defaults to BD). Handles the trunk prefix (leading 0) and a national number
// the user already prefixed with the country code.
const buildCanonicalPhone = (rawNational, dialCodeInput = BD_DIAL) => {
    const dial = normalizeDialCode(dialCodeInput) || BD_DIAL;
    let national = digitsOnly(rawNational);
    if (!national) return null;

    // Full international form typed in — peel the dial code off.
    if (national.startsWith(dial) && national.length > dial.length) {
        national = national.slice(dial.length);
    }

    // Drop the local trunk prefix: '01714...' -> '1714...'
    national = national.replace(/^0+/, '');
    if (!national) return null;

    return {
        dialCode: dial,
        nationalNumber: national,
        phone: dial + national,
    };
};

// Every stored-phone string a login/forgot input could plausibly match, so
// legacy or inconsistently-stored rows still resolve.
const matchCandidates = (rawInput, dialCodeInput = BD_DIAL) => {
    const canonical = buildCanonicalPhone(rawInput, dialCodeInput);
    const set = new Set();
    if (canonical) {
        set.add(canonical.phone);                 // 8801714526039
        set.add(canonical.nationalNumber);        // 1714526039
        set.add('0' + canonical.nationalNumber);  // 01714526039
    }
    const raw = digitsOnly(rawInput);
    if (raw) set.add(raw);
    return [...set];
};

// A Bangladeshi mobile is 10 national digits starting with 1 (operator prefixes
// 13–19), i.e. the canonical form is 8801XXXXXXXXX.
const isValidBdMobile = (rawInput) => {
    const canonical = buildCanonicalPhone(rawInput, BD_DIAL);
    if (!canonical) return false;
    return /^1[3-9]\d{8}$/.test(canonical.nationalNumber);
};

// The number an SMS/OTP goes to for a given user row.
const smsTarget = (row) => {
    if (!row) return '';
    const dial = normalizeDialCode(row.dial_code);
    const national = digitsOnly(row.national_number);
    if (dial && national) return dial + national;
    return digitsOnly(row.phone);
};

// Mask for display: 8801714526039 -> 8801*****039
const maskPhone = (phone) => {
    const d = digitsOnly(phone);
    if (d.length < 8) return d;
    return `${d.slice(0, 4)}*****${d.slice(-3)}`;
};

// Mask for display: someone@example.com -> so*****@example.com
const maskEmail = (email) => {
    const [local, domain] = String(email || '').split('@');
    if (!domain) return email;
    const head = local.slice(0, 2);
    return `${head}*****@${domain}`;
};

module.exports = {
    BD_DIAL,
    digitsOnly,
    normalizeDialCode,
    buildCanonicalPhone,
    matchCandidates,
    isValidBdMobile,
    smsTarget,
    maskPhone,
    maskEmail,
};
