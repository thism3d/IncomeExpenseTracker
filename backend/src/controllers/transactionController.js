const { query, withTransaction } = require('../utils/db');
const { ok, created, fail } = require('../utils/respond');

const shape = (r) => ({
    id: r.id,
    type: r.type,
    amount: Number(r.amount),
    accountId: r.account_id,
    accountName: r.account_name,
    toAccountId: r.to_account_id,
    toAccountName: r.to_account_name,
    categoryId: r.category_id,
    category: r.category_id
        ? { id: r.category_id, name: r.category_name, icon: r.category_icon, color: r.category_color }
        : null,
    paymentMethodId: r.payment_method_id,
    paymentMethod: r.payment_method_id
        ? { id: r.payment_method_id, name: r.pm_name, icon: r.pm_icon, color: r.pm_color }
        : null,
    note: r.note,
    occurredAt: r.occurred_at,
    recurrence: r.recurrence,
    recurrenceEnd: r.recurrence_end,
    reminderAt: r.reminder_at,
    itemCount: Number(r.item_count || 0),
    attachmentCount: Number(r.attachment_count || 0),
    createdAt: r.created_at,
});

const SELECT_TX = `
    SELECT t.*,
           a.name  AS account_name,
           ta.name AS to_account_name,
           c.name  AS category_name, c.icon AS category_icon, c.color AS category_color,
           p.name  AS pm_name,       p.icon AS pm_icon,       p.color AS pm_color,
           (SELECT COUNT(*) FROM transaction_items i WHERE i.transaction_id = t.id) AS item_count,
           (SELECT COUNT(*) FROM attachments  at WHERE at.transaction_id = t.id) AS attachment_count
      FROM transactions t
      JOIN accounts a         ON a.id = t.account_id
      LEFT JOIN accounts ta   ON ta.id = t.to_account_id
      LEFT JOIN categories c  ON c.id = t.category_id
      LEFT JOIN payment_methods p ON p.id = t.payment_method_id`;

// Every id the client sends must belong to the caller. Without this a user could
// attach their transaction to someone else's account or category.
const assertOwnership = async (userId, { accountId, toAccountId, categoryId, paymentMethodId, type }) => {
    if (accountId) {
        const r = await query(`SELECT id FROM accounts WHERE id = $1 AND user_id = $2`, [accountId, userId]);
        if (!r.rows.length) return 'Account not found';
    }
    if (toAccountId) {
        const r = await query(`SELECT id FROM accounts WHERE id = $1 AND user_id = $2`, [toAccountId, userId]);
        if (!r.rows.length) return 'Destination account not found';
    }
    if (categoryId) {
        const r = await query(`SELECT type FROM categories WHERE id = $1 AND user_id = $2`, [categoryId, userId]);
        if (!r.rows.length) return 'Category not found';
        // An income can't be filed under an expense category, and vice versa.
        if (type && type !== 'TRANSFER' && r.rows[0].type !== type) {
            return `That category is an ${r.rows[0].type.toLowerCase()} category`;
        }
    }
    if (paymentMethodId) {
        const r = await query(`SELECT id FROM payment_methods WHERE id = $1 AND user_id = $2`, [paymentMethodId, userId]);
        if (!r.rows.length) return 'Payment method not found';
    }
    return null;
};

const replaceItems = async (client, transactionId, items) => {
    await client.query(`DELETE FROM transaction_items WHERE transaction_id = $1`, [transactionId]);
    if (!items || !items.length) return;

    const values = [];
    const params = [];
    let i = 1;
    items.forEach((item, index) => {
        values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
        params.push(transactionId, item.name, item.quantity, item.unit || null, item.rate, index);
    });
    await client.query(
        `INSERT INTO transaction_items (transaction_id, name, quantity, unit, rate, position)
         VALUES ${values.join(', ')}`,
        params
    );
};

// Attachments are uploaded first (they need multipart), then bound to the
// transaction by id. Only unbound attachments owned by the caller can be claimed.
const linkAttachments = async (client, userId, transactionId, attachmentIds) => {
    if (!attachmentIds || !attachmentIds.length) return;
    await client.query(
        `UPDATE attachments SET transaction_id = $1
          WHERE id = ANY($2) AND user_id = $3
            AND (transaction_id IS NULL OR transaction_id = $1)`,
        [transactionId, attachmentIds, userId]
    );
};

const nextRun = (from, recurrence) => {
    if (!recurrence || recurrence === 'NONE') return null;
    const d = new Date(from);
    switch (recurrence) {
        case 'DAILY':   d.setDate(d.getDate() + 1); break;
        case 'WEEKLY':  d.setDate(d.getDate() + 7); break;
        case 'MONTHLY': d.setMonth(d.getMonth() + 1); break;
        case 'YEARLY':  d.setFullYear(d.getFullYear() + 1); break;
        default: return null;
    }
    return d;
};

// GET /api/transactions  (keyset pagination — the app scrolls forever)
const listTransactions = async (req, res) => {
    const q = req.validQuery;
    const params = [req.userId];
    const where = [`t.user_id = $1`];

    // Bind a value and return its placeholder, so a clause can reference it more
    // than once (the account filter matches both sides of a transfer).
    const bind = (value) => { params.push(value); return `$${params.length}`; };

    if (q.accountId) {
        const p = bind(q.accountId);
        where.push(`(t.account_id = ${p} OR t.to_account_id = ${p})`);
    }
    if (q.type)            where.push(`t.type = ${bind(q.type)}::transaction_type`);
    if (q.categoryId)      where.push(`t.category_id = ${bind(q.categoryId)}`);
    if (q.paymentMethodId) where.push(`t.payment_method_id = ${bind(q.paymentMethodId)}`);
    if (q.from)            where.push(`t.occurred_at >= ${bind(q.from)}`);
    if (q.to)              where.push(`t.occurred_at <= ${bind(q.to)}`);
    if (q.minAmount !== undefined) where.push(`t.amount >= ${bind(q.minAmount)}`);
    if (q.maxAmount !== undefined) where.push(`t.amount <= ${bind(q.maxAmount)}`);
    if (q.search) {
        params.push(`%${q.search}%`);
        const p = `$${params.length}`;
        where.push(`(t.note ILIKE ${p} OR c.name ILIKE ${p} OR a.name ILIKE ${p}
                     OR EXISTS (SELECT 1 FROM transaction_items i
                                 WHERE i.transaction_id = t.id AND i.name ILIKE ${p}))`);
    }

    // Keyset, not OFFSET: (occurred_at, id) strictly before the client's last row.
    // Stable under inserts, and stays fast at any depth.
    if (q.cursor && q.cursorId) {
        params.push(q.cursor, q.cursorId);
        where.push(`(t.occurred_at, t.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
    }

    params.push(q.limit + 1);
    const result = await query(
        `${SELECT_TX}
          WHERE ${where.join(' AND ')}
          ORDER BY t.occurred_at DESC, t.id DESC
          LIMIT $${params.length}`,
        params
    );

    const rows = result.rows.slice(0, q.limit);
    const hasMore = result.rows.length > q.limit;
    const last = rows[rows.length - 1];

    return ok(res, {
        transactions: rows.map(shape),
        hasMore,
        nextCursor: hasMore && last ? { cursor: last.occurred_at, cursorId: last.id } : null,
    });
};

// GET /api/transactions/:id  — the full record, with items and attachments
const getTransaction = async (req, res) => {
    const result = await query(`${SELECT_TX} WHERE t.id = $1 AND t.user_id = $2`, [req.params.id, req.userId]);
    if (!result.rows.length) return fail(res, 404, 'NOT_FOUND', 'Transaction not found');

    const [items, attachments] = await Promise.all([
        query(`SELECT * FROM transaction_items WHERE transaction_id = $1 ORDER BY position ASC`, [req.params.id]),
        query(`SELECT * FROM attachments WHERE transaction_id = $1 ORDER BY created_at ASC`, [req.params.id]),
    ]);

    return ok(res, {
        transaction: {
            ...shape(result.rows[0]),
            items: items.rows.map((i) => ({
                id: i.id,
                name: i.name,
                quantity: Number(i.quantity),
                unit: i.unit,
                rate: Number(i.rate),
                total: Number(i.total),
            })),
            attachments: attachments.rows.map((a) => ({
                id: a.id,
                kind: a.kind,
                name: a.original_name,
                mime: a.mime,
                size: Number(a.size_bytes),
                durationMs: a.duration_ms,
                url: `/api/files/${a.id}`,
                createdAt: a.created_at,
            })),
        },
    });
};

// POST /api/transactions
const createTransaction = async (req, res) => {
    const b = req.body;

    const ownershipError = await assertOwnership(req.userId, b);
    if (ownershipError) return fail(res, 400, 'BAD_REQUEST', ownershipError);

    const occurredAt = b.occurredAt || new Date();
    const id = await withTransaction(async (client) => {
        const inserted = await client.query(
            `INSERT INTO transactions
                (user_id, account_id, to_account_id, type, amount, category_id, payment_method_id,
                 note, occurred_at, recurrence, recurrence_end, next_run_at, reminder_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING id`,
            [
                req.userId, b.accountId, b.toAccountId || null, b.type, b.amount,
                b.categoryId || null, b.paymentMethodId || null, b.note || null,
                occurredAt, b.recurrence, b.recurrenceEnd || null,
                nextRun(occurredAt, b.recurrence), b.reminderAt || null,
            ]
        );
        const txId = inserted.rows[0].id;
        await replaceItems(client, txId, b.items);
        await linkAttachments(client, req.userId, txId, b.attachmentIds);
        return txId;
    });

    const result = await query(`${SELECT_TX} WHERE t.id = $1`, [id]);
    const payload = shape(result.rows[0]);

    // Push to the user's other open sessions (web + phone stay in sync).
    global.pushToUser?.(req.userId, 'transaction:created', payload);

    return created(res, { transaction: payload }, `${b.type === 'INCOME' ? 'Income' : b.type === 'EXPENSE' ? 'Expense' : 'Transfer'} saved`);
};

// PUT /api/transactions/:id
const updateTransaction = async (req, res) => {
    const b = req.body;

    const existing = await query(
        `SELECT * FROM transactions WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.userId]
    );
    if (!existing.rows.length) return fail(res, 404, 'NOT_FOUND', 'Transaction not found');
    const current = existing.rows[0];

    const ownershipError = await assertOwnership(req.userId, { ...b, type: current.type });
    if (ownershipError) return fail(res, 400, 'BAD_REQUEST', ownershipError);

    const accountId = b.accountId || current.account_id;
    const toAccountId = b.toAccountId === undefined ? current.to_account_id : b.toAccountId;
    if (current.type === 'TRANSFER' && !toAccountId) {
        return fail(res, 400, 'BAD_REQUEST', 'A transfer needs a destination account');
    }
    if (toAccountId && toAccountId === accountId) {
        return fail(res, 400, 'BAD_REQUEST', 'Source and destination accounts must differ');
    }

    const occurredAt = b.occurredAt || current.occurred_at;
    const recurrence = b.recurrence || current.recurrence;

    await withTransaction(async (client) => {
        await client.query(
            `UPDATE transactions
                SET account_id = $1,
                    to_account_id = $2,
                    amount = COALESCE($3, amount),
                    category_id = $4,
                    payment_method_id = $5,
                    note = $6,
                    occurred_at = $7,
                    recurrence = $8,
                    recurrence_end = $9,
                    next_run_at = $10,
                    reminder_at = $11,
                    reminder_sent = CASE WHEN $11::timestamptz IS DISTINCT FROM reminder_at THEN false ELSE reminder_sent END,
                    updated_at = NOW()
              WHERE id = $12 AND user_id = $13`,
            [
                accountId,
                toAccountId,
                b.amount ?? null,
                b.categoryId === undefined ? current.category_id : b.categoryId,
                b.paymentMethodId === undefined ? current.payment_method_id : b.paymentMethodId,
                b.note === undefined ? current.note : b.note,
                occurredAt,
                recurrence,
                b.recurrenceEnd === undefined ? current.recurrence_end : b.recurrenceEnd,
                nextRun(occurredAt, recurrence),
                b.reminderAt === undefined ? current.reminder_at : b.reminderAt,
                req.params.id,
                req.userId,
            ]
        );
        if (b.items !== undefined) await replaceItems(client, req.params.id, b.items);
        if (b.attachmentIds !== undefined) await linkAttachments(client, req.userId, req.params.id, b.attachmentIds);
    });

    const result = await query(`${SELECT_TX} WHERE t.id = $1`, [req.params.id]);
    const payload = shape(result.rows[0]);
    global.pushToUser?.(req.userId, 'transaction:updated', payload);

    return ok(res, { transaction: payload }, 'Transaction updated');
};

// DELETE /api/transactions/:id  (items and attachments cascade)
const deleteTransaction = async (req, res) => {
    const deleted = await query(
        `DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id`,
        [req.params.id, req.userId]
    );
    if (!deleted.rows.length) return fail(res, 404, 'NOT_FOUND', 'Transaction not found');

    global.pushToUser?.(req.userId, 'transaction:deleted', { id: req.params.id });
    return ok(res, { deleted: true }, 'Transaction deleted');
};

module.exports = {
    SELECT_TX,
    shape,
    listTransactions,
    getTransaction,
    createTransaction,
    updateTransaction,
    deleteTransaction,
};
