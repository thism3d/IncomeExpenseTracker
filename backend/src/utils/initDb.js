const bcrypt = require('bcryptjs');
const { pool, query } = require('./db');

// Idempotent schema. Runs on every boot: CREATE ... IF NOT EXISTS everywhere, so
// a deploy is just a restart. No migration framework.
//
// Note: this does NOT run inside a transaction. `CREATE TYPE` / `ALTER TYPE ...
// ADD VALUE` cannot be executed transactionally in Postgres, so each statement
// autocommits and the enum guards below swallow duplicate_object.

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE category_type AS ENUM ('INCOME', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE transaction_type AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE attachment_kind AS ENUM ('IMAGE', 'PDF', 'DOC', 'AUDIO', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM ('SYSTEM', 'REMINDER', 'RECURRING', 'BUDGET_ALERT', 'ADMIN_BROADCAST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name              VARCHAR(120) NOT NULL,
    email             VARCHAR(255) UNIQUE,
    phone             VARCHAR(20)  UNIQUE,   -- canonical: 8801XXXXXXXXX
    dial_code         VARCHAR(8),
    national_number   VARCHAR(20),
    password          VARCHAR(255),          -- bcrypt; null until set-password completes
    password_plain    TEXT,                  -- only written when SHOW_USER_PASSWORDS=true
    email_verified    BOOLEAN NOT NULL DEFAULT false,
    phone_verified    BOOLEAN NOT NULL DEFAULT false,
    pin_hash          VARCHAR(255),          -- bcrypt of the 4-6 digit app PIN
    biometric_enabled BOOLEAN NOT NULL DEFAULT false,
    lock_configured   BOOLEAN NOT NULL DEFAULT false,
    avatar            TEXT,
    currency          VARCHAR(8)  NOT NULL DEFAULT 'BDT',
    locale            VARCHAR(8)  NOT NULL DEFAULT 'en',
    theme             VARCHAR(10) NOT NULL DEFAULT 'system',
    status            user_status NOT NULL DEFAULT 'ACTIVE',
    is_admin          BOOLEAN NOT NULL DEFAULT false,
    last_login_at     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_identity_present CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone    ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);

-- ------------------------------------------------------------ otp_codes
CREATE TABLE IF NOT EXISTS otp_codes (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifier VARCHAR(255) NOT NULL,   -- canonical phone or email
    purpose    VARCHAR(40)  NOT NULL,   -- register | password_reset | change_email | change_phone
    code       VARCHAR(10)  NOT NULL,
    attempts   INTEGER      NOT NULL DEFAULT 0,
    expiry     TIMESTAMPTZ  NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_identifier ON otp_codes(identifier, purpose);

-- ------------------------------------------------------------- accounts
CREATE TABLE IF NOT EXISTS accounts (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         VARCHAR(120) NOT NULL,
    icon         VARCHAR(40)  NOT NULL DEFAULT 'wallet',
    color        VARCHAR(9)   NOT NULL DEFAULT '#0E7C66',
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_default   BOOLEAN NOT NULL DEFAULT false,
    archived     BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id) WHERE archived = false;

-- ----------------------------------------------------------- categories
CREATE TABLE IF NOT EXISTS categories (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       category_type NOT NULL,
    name       VARCHAR(80)   NOT NULL,
    icon       VARCHAR(40)   NOT NULL DEFAULT 'other_expenses',
    color      VARCHAR(9)    NOT NULL DEFAULT '#64748B',
    is_default BOOLEAN NOT NULL DEFAULT false,
    archived   BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, type, name)
);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id, type) WHERE archived = false;

-- ------------------------------------------------------ payment_methods
CREATE TABLE IF NOT EXISTS payment_methods (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(80) NOT NULL,
    icon       VARCHAR(40) NOT NULL DEFAULT 'others',
    color      VARCHAR(9)  NOT NULL DEFAULT '#64748B',
    is_default BOOLEAN NOT NULL DEFAULT false,
    archived   BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id) WHERE archived = false;

-- --------------------------------------------------------- transactions
-- A TRANSFER is one row: it debits account_id and credits to_account_id.
CREATE TABLE IF NOT EXISTS transactions (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_account_id     UUID REFERENCES accounts(id) ON DELETE SET NULL,
    type              transaction_type NOT NULL,
    amount            NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    category_id       UUID REFERENCES categories(id) ON DELETE SET NULL,
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
    note              TEXT,
    occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Recurrence: NONE | DAILY | WEEKLY | MONTHLY | YEARLY
    recurrence        VARCHAR(12) NOT NULL DEFAULT 'NONE',
    recurrence_end    DATE,
    next_run_at       TIMESTAMPTZ,
    reminder_at       TIMESTAMPTZ,
    reminder_sent     BOOLEAN NOT NULL DEFAULT false,
    -- Set on rows the recurrence engine generated, pointing at the template row.
    parent_id         UUID REFERENCES transactions(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT transfer_needs_destination CHECK (type <> 'TRANSFER' OR to_account_id IS NOT NULL),
    CONSTRAINT transfer_distinct_accounts CHECK (to_account_id IS NULL OR to_account_id <> account_id)
);
CREATE INDEX IF NOT EXISTS idx_tx_user_time    ON transactions(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_account_time ON transactions(account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_to_account   ON transactions(to_account_id) WHERE to_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_category     ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_recurring    ON transactions(next_run_at) WHERE recurrence <> 'NONE';
CREATE INDEX IF NOT EXISTS idx_tx_reminder     ON transactions(reminder_at) WHERE reminder_at IS NOT NULL AND reminder_sent = false;

-- ---------------------------------------------------- transaction_items
CREATE TABLE IF NOT EXISTS transaction_items (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    name           VARCHAR(160)  NOT NULL,
    quantity       NUMERIC(12,3) NOT NULL DEFAULT 1,
    unit           VARCHAR(32),
    rate           NUMERIC(14,2) NOT NULL DEFAULT 0,
    total          NUMERIC(14,2) GENERATED ALWAYS AS (ROUND(quantity * rate, 2)) STORED,
    position       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_items_tx ON transaction_items(transaction_id);

-- ---------------------------------------------------------- attachments
-- Doubles as the Drive: rows with a null transaction_id are standalone files.
CREATE TABLE IF NOT EXISTS attachments (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
    kind           attachment_kind NOT NULL,
    original_name  VARCHAR(255) NOT NULL,
    stored_path    TEXT         NOT NULL,
    mime           VARCHAR(120) NOT NULL,
    size_bytes     BIGINT       NOT NULL DEFAULT 0,
    duration_ms    INTEGER,     -- audio only
    topic          VARCHAR(100),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
-- Migration: Add topic to attachments if not exists
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS topic VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_attachments_user ON attachments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachments_tx   ON attachments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_attachments_kind ON attachments(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_attachments_topic ON attachments(user_id, topic) WHERE topic IS NOT NULL;

-- -------------------------------------------------------------- budgets
-- period: MONTHLY | WEEKLY | YEARLY. A null category_id is the overall budget.
CREATE TABLE IF NOT EXISTS budgets (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    period      VARCHAR(10) NOT NULL DEFAULT 'MONTHLY',
    amount      NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_overall
    ON budgets(user_id, period) WHERE category_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_category
    ON budgets(user_id, period, category_id) WHERE category_id IS NOT NULL;

-- -------------------------------------------------------- notifications
CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       notification_type NOT NULL DEFAULT 'SYSTEM',
    title      VARCHAR(160) NOT NULL,
    message    TEXT NOT NULL,
    data       JSONB,
    is_read    BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- -------------------------------------------------- push_subscriptions
-- One row per browser a user has granted notification permission in. The endpoint
-- is the browser's own push URL and is globally unique, so a re-subscribe from the
-- same browser updates rather than duplicates.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- ------------------------------------------------------------- settings
CREATE TABLE IF NOT EXISTS settings (
    key        VARCHAR(100) PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------- app_versions
CREATE TABLE IF NOT EXISTS app_versions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_name VARCHAR(20) NOT NULL,
    version_code INTEGER     NOT NULL,
    changelog    TEXT,
    apk_filename TEXT,
    apk_url      TEXT,        -- relative, e.g. /downloads/sisirbindu-v3.apk
    mandatory    BOOLEAN NOT NULL DEFAULT false,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_versions_code ON app_versions(version_code DESC);

-- ------------------------------------------------------------ audit_log
CREATE TABLE IF NOT EXISTS audit_log (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    action     VARCHAR(80) NOT NULL,
    target     VARCHAR(120),
    detail     JSONB,
    ip         VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
`;

const SEED_SETTINGS = `
INSERT INTO settings (key, value) VALUES
    ('maintenance_active',     'false'),
    ('maintenance_message',    'We are performing scheduled maintenance. Please check back shortly.'),
    ('maintenance_start',      ''),
    ('maintenance_end',        ''),
    ('maintenance_updated_at', ''),
    ('default_currency',       'BDT'),
    ('support_email',          'support@heat6.com')
ON CONFLICT (key) DO NOTHING;
`;

const initDatabase = async () => {
    const client = await pool.connect();
    try {
        await client.query(SCHEMA);
        await client.query(SEED_SETTINGS);
        console.log('Schema ready');
    } finally {
        client.release();
    }

    await seedAdmin();
};

// The admin account is a normal user row with is_admin = true. It has no
// tracker data of its own and never goes through the OTP flow.
const seedAdmin = async () => {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
        console.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed');
        return;
    }
    const hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS, 10) || 12);
    const plain = process.env.SHOW_USER_PASSWORDS === 'true' ? password : null;

    await query(
        `INSERT INTO users (name, email, password, password_plain, email_verified, is_admin, status, lock_configured)
         VALUES ($1, $2, $3, $4, true, true, 'ACTIVE', true)
         ON CONFLICT (email) DO UPDATE
            SET password = EXCLUDED.password,
                password_plain = EXCLUDED.password_plain,
                is_admin = true,
                updated_at = NOW()`,
        [process.env.ADMIN_NAME || 'Admin', email, hash, plain]
    );
    console.log(`Admin ready: ${email}`);
};

module.exports = { initDatabase };
