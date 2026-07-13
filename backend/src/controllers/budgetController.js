const { query } = require('../utils/db');
const { ok, fail } = require('../utils/respond');

const shape = (r) => ({
    id: r.id,
    categoryId: r.category_id,
    category: r.category_id
        ? { id: r.category_id, name: r.category_name, icon: r.category_icon, color: r.category_color }
        : null,
    period: r.period,
    amount: Number(r.amount),
});

// GET /api/budgets?period=
const listBudgets = async (req, res) => {
    const period = (req.query.period || '').toUpperCase();
    const result = await query(
        `SELECT b.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
           FROM budgets b
           LEFT JOIN categories c ON c.id = b.category_id
          WHERE b.user_id = $1 AND ($2 = '' OR b.period = $2)
          ORDER BY (b.category_id IS NOT NULL), c.name ASC`,
        [req.userId, period]
    );
    return ok(res, { budgets: result.rows.map(shape) });
};

// PUT /api/budgets   { categoryId?, period, amount }
// Upsert: setting a budget for a category that already has one replaces it. The
// two partial unique indexes (overall vs per-category) make this a single
// statement instead of a read-then-write race.
const setBudget = async (req, res) => {
    const { categoryId, period, amount } = req.body;

    if (categoryId) {
        const owns = await query(
            `SELECT id FROM categories WHERE id = $1 AND user_id = $2 AND type = 'EXPENSE'`,
            [categoryId, req.userId]
        );
        if (!owns.rows.length) {
            return fail(res, 400, 'BAD_REQUEST', 'Budgets can only be set on your own expense categories');
        }
    }

    const conflict = categoryId
        ? `(user_id, period, category_id) WHERE category_id IS NOT NULL`
        : `(user_id, period) WHERE category_id IS NULL`;

    const result = await query(
        `INSERT INTO budgets (user_id, category_id, period, amount)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ${conflict}
         DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW()
         RETURNING *`,
        [req.userId, categoryId || null, period, amount]
    );

    const row = await query(
        `SELECT b.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
           FROM budgets b LEFT JOIN categories c ON c.id = b.category_id
          WHERE b.id = $1`,
        [result.rows[0].id]
    );

    return ok(res, { budget: shape(row.rows[0]) }, 'Budget saved');
};

// DELETE /api/budgets/:id
const deleteBudget = async (req, res) => {
    const deleted = await query(
        `DELETE FROM budgets WHERE id = $1 AND user_id = $2 RETURNING id`,
        [req.params.id, req.userId]
    );
    if (!deleted.rows.length) return fail(res, 404, 'NOT_FOUND', 'Budget not found');
    return ok(res, { deleted: true }, 'Budget removed');
};

module.exports = { listBudgets, setBudget, deleteBudget };
