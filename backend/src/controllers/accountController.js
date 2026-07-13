const { query } = require('../utils/db');
const { ok, created, fail } = require('../utils/respond');

// An account's balance is its opening balance, plus everything that landed in it
// (income + incoming transfers), minus everything that left it (expense +
// outgoing transfers). Computed in SQL so it can never drift from the ledger.
const BALANCE_SELECT = `
    a.opening_balance
    + COALESCE((SELECT SUM(t.amount) FROM transactions t
                 WHERE t.account_id = a.id AND t.type = 'INCOME'), 0)
    + COALESCE((SELECT SUM(t.amount) FROM transactions t
                 WHERE t.to_account_id = a.id AND t.type = 'TRANSFER'), 0)
    - COALESCE((SELECT SUM(t.amount) FROM transactions t
                 WHERE t.account_id = a.id AND t.type = 'EXPENSE'), 0)
    - COALESCE((SELECT SUM(t.amount) FROM transactions t
                 WHERE t.account_id = a.id AND t.type = 'TRANSFER'), 0)
    AS balance`;

const shape = (r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    openingBalance: Number(r.opening_balance),
    balance: Number(r.balance),
    isDefault: r.is_default,
    archived: r.archived,
    transactionCount: r.transaction_count !== undefined ? Number(r.transaction_count) : undefined,
    createdAt: r.created_at,
});

// GET /api/accounts?search=&includeArchived=
const listAccounts = async (req, res) => {
    const search = (req.query.search || '').trim();
    const includeArchived = req.query.includeArchived === 'true';

    const result = await query(
        `SELECT a.*, ${BALANCE_SELECT},
                (SELECT COUNT(*) FROM transactions t
                  WHERE t.account_id = a.id OR t.to_account_id = a.id) AS transaction_count
           FROM accounts a
          WHERE a.user_id = $1
            AND ($2 = '' OR a.name ILIKE '%' || $2 || '%')
            AND ($3 OR a.archived = false)
          ORDER BY a.is_default DESC, a.name ASC`,
        [req.userId, search, includeArchived]
    );

    return ok(res, { accounts: result.rows.map(shape) });
};

// GET /api/accounts/:id
const getAccount = async (req, res) => {
    const result = await query(
        `SELECT a.*, ${BALANCE_SELECT} FROM accounts a WHERE a.id = $1 AND a.user_id = $2`,
        [req.params.id, req.userId]
    );
    if (!result.rows.length) return fail(res, 404, 'NOT_FOUND', 'Account not found');
    return ok(res, { account: shape(result.rows[0]) });
};

// POST /api/accounts   { name, icon?, color?, openingBalance? }
const createAccount = async (req, res) => {
    const { name, icon, color, openingBalance } = req.body;

    const existing = await query(
        `SELECT id FROM accounts WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
        [req.userId, name]
    );
    if (existing.rows.length) {
        return fail(res, 409, 'DUPLICATE', 'You already have an account with that name');
    }

    const inserted = await query(
        `INSERT INTO accounts (user_id, name, icon, color, opening_balance)
         VALUES ($1, $2, COALESCE($3, 'wallet'), COALESCE($4, '#0E7C66'), $5)
         RETURNING id`,
        [req.userId, name, icon || null, color || null, openingBalance]
    );

    const row = await query(
        `SELECT a.*, ${BALANCE_SELECT} FROM accounts a WHERE a.id = $1`,
        [inserted.rows[0].id]
    );
    return created(res, { account: shape(row.rows[0]) }, 'Account added');
};

// PUT /api/accounts/:id
const updateAccount = async (req, res) => {
    const { name, icon, color, openingBalance, archived } = req.body;

    if (name) {
        const clash = await query(
            `SELECT id FROM accounts WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3`,
            [req.userId, name, req.params.id]
        );
        if (clash.rows.length) {
            return fail(res, 409, 'DUPLICATE', 'You already have an account with that name');
        }
    }

    const updated = await query(
        `UPDATE accounts
            SET name = COALESCE($1, name),
                icon = COALESCE($2, icon),
                color = COALESCE($3, color),
                opening_balance = COALESCE($4, opening_balance),
                archived = COALESCE($5, archived),
                updated_at = NOW()
          WHERE id = $6 AND user_id = $7
      RETURNING id`,
        [
            name || null,
            icon || null,
            color || null,
            openingBalance === undefined ? null : openingBalance,
            archived === undefined ? null : archived,
            req.params.id,
            req.userId,
        ]
    );
    if (!updated.rows.length) return fail(res, 404, 'NOT_FOUND', 'Account not found');

    const row = await query(
        `SELECT a.*, ${BALANCE_SELECT} FROM accounts a WHERE a.id = $1`,
        [req.params.id]
    );
    return ok(res, { account: shape(row.rows[0]) }, 'Account updated');
};

// DELETE /api/accounts/:id
// Deleting an account cascades to its transactions, so a populated account can
// only be archived — the user has to move or delete the transactions first.
const deleteAccount = async (req, res) => {
    const account = await query(
        `SELECT id, is_default FROM accounts WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.userId]
    );
    if (!account.rows.length) return fail(res, 404, 'NOT_FOUND', 'Account not found');

    const remaining = await query(
        `SELECT COUNT(*)::int AS n FROM accounts WHERE user_id = $1 AND archived = false`,
        [req.userId]
    );
    if (remaining.rows[0].n <= 1) {
        return fail(res, 400, 'LAST_ACCOUNT', 'You must keep at least one account');
    }

    const used = await query(
        `SELECT COUNT(*)::int AS n FROM transactions
          WHERE account_id = $1 OR to_account_id = $1`,
        [req.params.id]
    );
    if (used.rows[0].n > 0) {
        return fail(res, 409, 'ACCOUNT_IN_USE',
            `This account has ${used.rows[0].n} transaction(s). Archive it instead, or delete its transactions first.`);
    }

    await query(`DELETE FROM accounts WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);

    // The default account can't just vanish — promote another one.
    if (account.rows[0].is_default) {
        await query(
            `UPDATE accounts SET is_default = true
              WHERE id = (SELECT id FROM accounts
                           WHERE user_id = $1 AND archived = false
                           ORDER BY created_at ASC LIMIT 1)`,
            [req.userId]
        );
    }

    return ok(res, { deleted: true }, 'Account deleted');
};

// POST /api/accounts/:id/default
const setDefaultAccount = async (req, res) => {
    const exists = await query(
        `SELECT id FROM accounts WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.userId]
    );
    if (!exists.rows.length) return fail(res, 404, 'NOT_FOUND', 'Account not found');

    await query(`UPDATE accounts SET is_default = (id = $1) WHERE user_id = $2`, [req.params.id, req.userId]);
    return ok(res, { defaultAccountId: req.params.id }, 'Default account set');
};

module.exports = {
    BALANCE_SELECT,
    listAccounts,
    getAccount,
    createAccount,
    updateAccount,
    deleteAccount,
    setDefaultAccount,
};
