// Categories and payment methods. They differ only in that a category is typed
// (INCOME | EXPENSE), so they share one controller.

const { query } = require('../utils/db');
const { ok, created, fail } = require('../utils/respond');

const shapeCategory = (r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    icon: r.icon,
    color: r.color,
    isDefault: r.is_default,
    archived: r.archived,
    usageCount: r.usage_count !== undefined ? Number(r.usage_count) : undefined,
});

const shapePaymentMethod = (r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    isDefault: r.is_default,
    archived: r.archived,
    usageCount: r.usage_count !== undefined ? Number(r.usage_count) : undefined,
});

// ------------------------------------------------------------------ categories

// GET /api/categories?type=&search=&includeArchived=
const listCategories = async (req, res) => {
    const { type, search = '', includeArchived } = req.query;
    const result = await query(
        `SELECT c.*, (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) AS usage_count
           FROM categories c
          WHERE c.user_id = $1
            AND ($2::text IS NULL OR c.type = $2::category_type)
            AND ($3 = '' OR c.name ILIKE '%' || $3 || '%')
            AND ($4 OR c.archived = false)
          ORDER BY c.is_default DESC, c.name ASC`,
        [req.userId, type || null, String(search).trim(), includeArchived === 'true']
    );
    return ok(res, { categories: result.rows.map(shapeCategory) });
};

// POST /api/categories   { type, name, icon?, color? }
const createCategory = async (req, res) => {
    const { type, name, icon, color } = req.body;

    const clash = await query(
        `SELECT id FROM categories WHERE user_id = $1 AND type = $2 AND LOWER(name) = LOWER($3)`,
        [req.userId, type, name]
    );
    if (clash.rows.length) {
        return fail(res, 409, 'DUPLICATE', `You already have a ${type.toLowerCase()} category called "${name}"`);
    }

    const inserted = await query(
        `INSERT INTO categories (user_id, type, name, icon, color, is_default)
         VALUES ($1, $2, $3, COALESCE($4, 'other_expenses'), COALESCE($5, '#64748B'), false)
         RETURNING *`,
        [req.userId, type, name, icon || null, color || null]
    );
    return created(res, { category: shapeCategory(inserted.rows[0]) }, 'Category added');
};

// PUT /api/categories/:id
const updateCategory = async (req, res) => {
    const { name, icon, color, archived } = req.body;

    if (name) {
        const clash = await query(
            `SELECT id FROM categories
              WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3
                AND type = (SELECT type FROM categories WHERE id = $3)`,
            [req.userId, name, req.params.id]
        );
        if (clash.rows.length) return fail(res, 409, 'DUPLICATE', 'You already have a category with that name');
    }

    const updated = await query(
        `UPDATE categories
            SET name = COALESCE($1, name),
                icon = COALESCE($2, icon),
                color = COALESCE($3, color),
                archived = COALESCE($4, archived)
          WHERE id = $5 AND user_id = $6
      RETURNING *`,
        [name || null, icon || null, color || null,
         archived === undefined ? null : archived, req.params.id, req.userId]
    );
    if (!updated.rows.length) return fail(res, 404, 'NOT_FOUND', 'Category not found');
    return ok(res, { category: shapeCategory(updated.rows[0]) }, 'Category updated');
};

// DELETE /api/categories/:id
// A category in use is archived rather than deleted, so historical transactions
// keep their label instead of silently becoming "Uncategorised".
const deleteCategory = async (req, res) => {
    const used = await query(
        `SELECT COUNT(*)::int AS n FROM transactions WHERE category_id = $1 AND user_id = $2`,
        [req.params.id, req.userId]
    );
    if (used.rows[0].n > 0) {
        const archived = await query(
            `UPDATE categories SET archived = true WHERE id = $1 AND user_id = $2 RETURNING *`,
            [req.params.id, req.userId]
        );
        if (!archived.rows.length) return fail(res, 404, 'NOT_FOUND', 'Category not found');
        return ok(res, { archived: true, category: shapeCategory(archived.rows[0]) },
            `This category is used by ${used.rows[0].n} transaction(s), so it was hidden instead of deleted.`);
    }

    const deleted = await query(
        `DELETE FROM categories WHERE id = $1 AND user_id = $2 RETURNING id`,
        [req.params.id, req.userId]
    );
    if (!deleted.rows.length) return fail(res, 404, 'NOT_FOUND', 'Category not found');
    return ok(res, { deleted: true }, 'Category deleted');
};

// ------------------------------------------------------------ payment methods

// GET /api/payment-methods?search=&includeArchived=
const listPaymentMethods = async (req, res) => {
    const { search = '', includeArchived } = req.query;
    const result = await query(
        `SELECT p.*, (SELECT COUNT(*) FROM transactions t WHERE t.payment_method_id = p.id) AS usage_count
           FROM payment_methods p
          WHERE p.user_id = $1
            AND ($2 = '' OR p.name ILIKE '%' || $2 || '%')
            AND ($3 OR p.archived = false)
          ORDER BY p.is_default DESC, p.name ASC`,
        [req.userId, String(search).trim(), includeArchived === 'true']
    );
    return ok(res, { paymentMethods: result.rows.map(shapePaymentMethod) });
};

// POST /api/payment-methods   { name, icon?, color? }
const createPaymentMethod = async (req, res) => {
    const { name, icon, color } = req.body;

    const clash = await query(
        `SELECT id FROM payment_methods WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
        [req.userId, name]
    );
    if (clash.rows.length) return fail(res, 409, 'DUPLICATE', 'You already have a payment method with that name');

    const inserted = await query(
        `INSERT INTO payment_methods (user_id, name, icon, color, is_default)
         VALUES ($1, $2, COALESCE($3, 'others'), COALESCE($4, '#64748B'), false)
         RETURNING *`,
        [req.userId, name, icon || null, color || null]
    );
    return created(res, { paymentMethod: shapePaymentMethod(inserted.rows[0]) }, 'Payment method added');
};

// PUT /api/payment-methods/:id
const updatePaymentMethod = async (req, res) => {
    const { name, icon, color, archived } = req.body;

    if (name) {
        const clash = await query(
            `SELECT id FROM payment_methods WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3`,
            [req.userId, name, req.params.id]
        );
        if (clash.rows.length) return fail(res, 409, 'DUPLICATE', 'You already have a payment method with that name');
    }

    const updated = await query(
        `UPDATE payment_methods
            SET name = COALESCE($1, name),
                icon = COALESCE($2, icon),
                color = COALESCE($3, color),
                archived = COALESCE($4, archived)
          WHERE id = $5 AND user_id = $6
      RETURNING *`,
        [name || null, icon || null, color || null,
         archived === undefined ? null : archived, req.params.id, req.userId]
    );
    if (!updated.rows.length) return fail(res, 404, 'NOT_FOUND', 'Payment method not found');
    return ok(res, { paymentMethod: shapePaymentMethod(updated.rows[0]) }, 'Payment method updated');
};

// DELETE /api/payment-methods/:id
const deletePaymentMethod = async (req, res) => {
    const used = await query(
        `SELECT COUNT(*)::int AS n FROM transactions WHERE payment_method_id = $1 AND user_id = $2`,
        [req.params.id, req.userId]
    );
    if (used.rows[0].n > 0) {
        const archived = await query(
            `UPDATE payment_methods SET archived = true WHERE id = $1 AND user_id = $2 RETURNING *`,
            [req.params.id, req.userId]
        );
        if (!archived.rows.length) return fail(res, 404, 'NOT_FOUND', 'Payment method not found');
        return ok(res, { archived: true, paymentMethod: shapePaymentMethod(archived.rows[0]) },
            `This payment method is used by ${used.rows[0].n} transaction(s), so it was hidden instead of deleted.`);
    }

    const deleted = await query(
        `DELETE FROM payment_methods WHERE id = $1 AND user_id = $2 RETURNING id`,
        [req.params.id, req.userId]
    );
    if (!deleted.rows.length) return fail(res, 404, 'NOT_FOUND', 'Payment method not found');
    return ok(res, { deleted: true }, 'Payment method deleted');
};

module.exports = {
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    listPaymentMethods,
    createPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
};
