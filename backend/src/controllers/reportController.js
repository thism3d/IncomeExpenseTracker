// All reporting aggregates run in SQL. Transfers are deliberately excluded from
// income/expense totals everywhere — money moving between a user's own accounts
// is not income or spending, and counting it would inflate every report.

const { query } = require('../utils/db');
const { ok } = require('../utils/respond');

const GRAIN = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

// Resolve a period into a concrete [from, to). An explicit from/to always wins.
const resolveRange = (q) => {
    if (q.from && q.to) return { from: q.from, to: q.to };

    const now = new Date();
    const to = q.to || now;
    let from = q.from;

    if (!from) {
        from = new Date(now);
        switch (q.period) {
            case 'daily':   from.setHours(0, 0, 0, 0); break;
            case 'weekly':  from.setDate(from.getDate() - 7); break;
            case 'yearly':  from.setFullYear(from.getFullYear() - 1); break;
            case 'monthly':
            default:        from.setMonth(from.getMonth() - 1); break;
        }
    }
    return { from, to };
};

// A filter fragment applied to every aggregate, so `?accountId=` scopes the
// whole report to one account.
const accountFilter = (accountId, params) => {
    if (!accountId) return '';
    params.push(accountId);
    return ` AND t.account_id = $${params.length}`;
};

// GET /api/reports/summary?period=&accountId=&from=&to=
// The Home screen header: income, expense, net, and the balance carried in.
const getSummary = async (req, res) => {
    const q = req.validQuery;
    const { from, to } = resolveRange(q);

    const params = [req.userId, from, to];
    const filter = accountFilter(q.accountId, params);

    const totals = await query(
        `SELECT
            COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'),  0) AS income,
            COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE'), 0) AS expense,
            COUNT(*) FILTER (WHERE t.type = 'INCOME')  AS income_count,
            COUNT(*) FILTER (WHERE t.type = 'EXPENSE') AS expense_count
           FROM transactions t
          WHERE t.user_id = $1 AND t.occurred_at >= $2 AND t.occurred_at <= $3${filter}`,
        params
    );

    // "Previous balance" (README): everything that happened before this window.
    // Scoped to one account it must account for transfers in and out; across all
    // accounts transfers net to zero, so they drop out.
    const prevParams = [req.userId, from];
    let prevSql;
    if (q.accountId) {
        prevParams.push(q.accountId);
        prevSql = `
            SELECT COALESCE((SELECT opening_balance FROM accounts WHERE id = $3), 0)
                 + COALESCE(SUM(CASE
                       WHEN t.type = 'INCOME'   AND t.account_id    = $3 THEN  t.amount
                       WHEN t.type = 'EXPENSE'  AND t.account_id    = $3 THEN -t.amount
                       WHEN t.type = 'TRANSFER' AND t.account_id    = $3 THEN -t.amount
                       WHEN t.type = 'TRANSFER' AND t.to_account_id = $3 THEN  t.amount
                       ELSE 0 END), 0) AS previous_balance
              FROM transactions t
             WHERE t.user_id = $1 AND t.occurred_at < $2
               AND (t.account_id = $3 OR t.to_account_id = $3)`;
    } else {
        prevSql = `
            SELECT COALESCE((SELECT SUM(opening_balance) FROM accounts WHERE user_id = $1), 0)
                 + COALESCE(SUM(CASE
                       WHEN t.type = 'INCOME'  THEN  t.amount
                       WHEN t.type = 'EXPENSE' THEN -t.amount
                       ELSE 0 END), 0) AS previous_balance
              FROM transactions t
             WHERE t.user_id = $1 AND t.occurred_at < $2`;
    }
    const previous = await query(prevSql, prevParams);

    const income = Number(totals.rows[0].income);
    const expense = Number(totals.rows[0].expense);
    const previousBalance = Number(previous.rows[0].previous_balance);

    return ok(res, {
        range: { from, to, period: q.period },
        income,
        expense,
        net: Number((income - expense).toFixed(2)),
        previousBalance: Number(previousBalance.toFixed(2)),
        balance: Number((previousBalance + income - expense).toFixed(2)),
        incomeCount: Number(totals.rows[0].income_count),
        expenseCount: Number(totals.rows[0].expense_count),
    });
};

// GET /api/reports/trend?period=&accountId=&from=&to=
// The income/expense chart. generate_series fills empty buckets, so the chart
// has no gaps on days with no activity.
const getTrend = async (req, res) => {
    const q = req.validQuery;
    const { from, to } = resolveRange(q);
    const grain = GRAIN[q.period] || 'month';

    const params = [req.userId, from, to];
    const filter = accountFilter(q.accountId, params);

    const result = await query(
        `WITH buckets AS (
            SELECT generate_series(
                date_trunc('${grain}', $2::timestamptz),
                date_trunc('${grain}', $3::timestamptz),
                ('1 ${grain}')::interval
            ) AS bucket
         )
         SELECT b.bucket,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'),  0) AS income,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE'), 0) AS expense
           FROM buckets b
           LEFT JOIN transactions t
             ON date_trunc('${grain}', t.occurred_at) = b.bucket
            AND t.user_id = $1
            AND t.occurred_at >= $2 AND t.occurred_at <= $3
            AND t.type <> 'TRANSFER'${filter}
          GROUP BY b.bucket
          ORDER BY b.bucket ASC`,
        params
    );

    return ok(res, {
        range: { from, to, period: q.period, grain },
        points: result.rows.map((r) => ({
            date: r.bucket,
            income: Number(r.income),
            expense: Number(r.expense),
            net: Number((Number(r.income) - Number(r.expense)).toFixed(2)),
        })),
    });
};

// GET /api/reports/categories?period=&accountId=&type=&from=&to=
// Category breakdown for the donut/pie chart.
const getCategoryBreakdown = async (req, res) => {
    const q = req.validQuery;
    const { from, to } = resolveRange(q);
    const type = req.query.type === 'INCOME' ? 'INCOME' : 'EXPENSE';

    const params = [req.userId, from, to, type];
    const filter = accountFilter(q.accountId, params);

    const result = await query(
        `SELECT c.id, c.name, c.icon, c.color,
                SUM(t.amount) AS total,
                COUNT(*)::int AS count,
                ROUND(100.0 * SUM(t.amount) / NULLIF(SUM(SUM(t.amount)) OVER (), 0), 2) AS percent
           FROM transactions t
           LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.user_id = $1
            AND t.occurred_at >= $2 AND t.occurred_at <= $3
            AND t.type = $4::transaction_type${filter}
          GROUP BY c.id, c.name, c.icon, c.color
          ORDER BY total DESC`,
        params
    );

    return ok(res, {
        range: { from, to, period: q.period },
        type,
        categories: result.rows.map((r) => ({
            id: r.id,
            name: r.name || 'Uncategorised',
            icon: r.icon || 'other_expenses',
            color: r.color || '#64748B',
            total: Number(r.total),
            count: r.count,
            percent: Number(r.percent || 0),
        })),
        total: result.rows.reduce((sum, r) => sum + Number(r.total), 0),
    });
};

// GET /api/reports/payment-methods?period=&accountId=&from=&to=
// The README's "Payment Method section shows specific payment method their
// income and expense in total".
const getPaymentMethodBreakdown = async (req, res) => {
    const q = req.validQuery;
    const { from, to } = resolveRange(q);

    const params = [req.userId, from, to];
    const filter = accountFilter(q.accountId, params);

    const result = await query(
        `SELECT p.id, p.name, p.icon, p.color,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'),  0) AS income,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE'), 0) AS expense,
                COUNT(*)::int AS count
           FROM transactions t
           LEFT JOIN payment_methods p ON p.id = t.payment_method_id
          WHERE t.user_id = $1
            AND t.occurred_at >= $2 AND t.occurred_at <= $3
            AND t.type <> 'TRANSFER'${filter}
          GROUP BY p.id, p.name, p.icon, p.color
          ORDER BY (COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE'), 0)
                  + COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'),  0)) DESC`,
        params
    );

    return ok(res, {
        range: { from, to, period: q.period },
        paymentMethods: result.rows.map((r) => ({
            id: r.id,
            name: r.name || 'Unspecified',
            icon: r.icon || 'others',
            color: r.color || '#64748B',
            income: Number(r.income),
            expense: Number(r.expense),
            net: Number((Number(r.income) - Number(r.expense)).toFixed(2)),
            count: r.count,
        })),
    });
};

// GET /api/reports/calendar?month=YYYY-MM&accountId=
// Per-day totals for the calendar screen, plus the month's rollup.
const getCalendar = async (req, res) => {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '')
        ? `${req.query.month}-01`
        : new Date().toISOString().slice(0, 8) + '01';

    const params = [req.userId, month];
    const filter = accountFilter(req.query.accountId, params);

    const result = await query(
        `SELECT (t.occurred_at AT TIME ZONE 'Asia/Dhaka')::date AS day,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'),  0) AS income,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE'), 0) AS expense,
                COUNT(*)::int AS count
           FROM transactions t
          WHERE t.user_id = $1
            AND t.occurred_at >= $2::date
            AND t.occurred_at <  ($2::date + INTERVAL '1 month')
            AND t.type <> 'TRANSFER'${filter}
          GROUP BY day
          ORDER BY day ASC`,
        params
    );

    const days = result.rows.map((r) => ({
        date: r.day,
        income: Number(r.income),
        expense: Number(r.expense),
        net: Number((Number(r.income) - Number(r.expense)).toFixed(2)),
        count: r.count,
    }));

    const income = days.reduce((s, d) => s + d.income, 0);
    const expense = days.reduce((s, d) => s + d.expense, 0);

    return ok(res, {
        month: month.slice(0, 7),
        days,
        totals: {
            income: Number(income.toFixed(2)),
            expense: Number(expense.toFixed(2)),
            balance: Number((income - expense).toFixed(2)),
        },
    });
};

// GET /api/reports/budget?period=
// Budget vs actual: spent, budget, remaining, and the per-day average the README
// asks for on the Monthly Budget card.
const getBudget = async (req, res) => {
    const period = ['WEEKLY', 'MONTHLY', 'YEARLY'].includes((req.query.period || '').toUpperCase())
        ? req.query.period.toUpperCase()
        : 'MONTHLY';

    const grain = { WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[period];

    const result = await query(
        `WITH window_bounds AS (
            SELECT date_trunc('${grain}', NOW()) AS start_at,
                   date_trunc('${grain}', NOW()) + ('1 ${grain}')::interval AS end_at
         ),
         spend AS (
            SELECT t.category_id, SUM(t.amount) AS spent
              FROM transactions t, window_bounds w
             WHERE t.user_id = $1 AND t.type = 'EXPENSE'
               AND t.occurred_at >= w.start_at AND t.occurred_at < w.end_at
             GROUP BY t.category_id
         )
         SELECT b.id, b.category_id, b.amount,
                c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
                COALESCE(
                    CASE WHEN b.category_id IS NULL
                         THEN (SELECT SUM(spent) FROM spend)
                         ELSE (SELECT spent FROM spend s WHERE s.category_id = b.category_id)
                    END, 0) AS spent,
                (SELECT start_at FROM window_bounds) AS start_at,
                (SELECT end_at   FROM window_bounds) AS end_at
           FROM budgets b
           LEFT JOIN categories c ON c.id = b.category_id
          WHERE b.user_id = $1 AND b.period = $2
          ORDER BY (b.category_id IS NOT NULL), c.name ASC`,
        [req.userId, period]
    );

    const now = new Date();
    const rows = result.rows.map((r) => {
        const budget = Number(r.amount);
        const spent = Number(r.spent);
        const start = new Date(r.start_at);
        const end = new Date(r.end_at);
        const daysElapsed = Math.max(1, Math.ceil((now - start) / 86400000));
        const daysTotal = Math.max(1, Math.round((end - start) / 86400000));
        const remaining = budget - spent;

        return {
            id: r.id,
            categoryId: r.category_id,
            category: r.category_id
                ? { id: r.category_id, name: r.category_name, icon: r.category_icon, color: r.category_color }
                : null,
            budget,
            spent,
            remaining: Number(remaining.toFixed(2)),
            percentUsed: budget > 0 ? Number(((spent / budget) * 100).toFixed(1)) : 0,
            perDayAverage: Number((spent / daysElapsed).toFixed(2)),
            // What's left, spread over the days still to come.
            perDayRemaining: Number((remaining / Math.max(1, daysTotal - daysElapsed + 1)).toFixed(2)),
            daysElapsed,
            daysTotal,
        };
    });

    return ok(res, {
        period,
        overall: rows.find((r) => !r.categoryId) || null,
        categories: rows.filter((r) => r.categoryId),
    });
};

// GET /api/reports/overview  — one call that fills the whole Home screen.
const getOverview = async (req, res) => {
    const accountId = req.query.accountId || null;

    const params = [req.userId];
    if (accountId) params.push(accountId);

    let buckets;
    if (accountId) {
        buckets = await query(
            `SELECT
                COALESCE(SUM(t.amount) FILTER (WHERE (t.type = 'INCOME' OR (t.type = 'TRANSFER' AND t.to_account_id = $2)) AND t.occurred_at >= date_trunc('day',   NOW())), 0) AS day_income,
                COALESCE(SUM(t.amount) FILTER (WHERE (t.type = 'EXPENSE' OR (t.type = 'TRANSFER' AND t.account_id = $2)) AND t.occurred_at >= date_trunc('day',   NOW())), 0) AS day_expense,
                COALESCE(SUM(t.amount) FILTER (WHERE (t.type = 'INCOME' OR (t.type = 'TRANSFER' AND t.to_account_id = $2)) AND t.occurred_at >= date_trunc('week',  NOW())), 0) AS week_income,
                COALESCE(SUM(t.amount) FILTER (WHERE (t.type = 'EXPENSE' OR (t.type = 'TRANSFER' AND t.account_id = $2)) AND t.occurred_at >= date_trunc('week',  NOW())), 0) AS week_expense,
                COALESCE(SUM(t.amount) FILTER (WHERE (t.type = 'INCOME' OR (t.type = 'TRANSFER' AND t.to_account_id = $2)) AND t.occurred_at >= date_trunc('month', NOW())), 0) AS month_income,
                COALESCE(SUM(t.amount) FILTER (WHERE (t.type = 'EXPENSE' OR (t.type = 'TRANSFER' AND t.account_id = $2)) AND t.occurred_at >= date_trunc('month', NOW())), 0) AS month_expense,
                COALESCE(SUM(t.amount) FILTER (WHERE (t.type = 'INCOME' OR (t.type = 'TRANSFER' AND t.to_account_id = $2)) AND t.occurred_at >= date_trunc('year',  NOW())), 0) AS year_income,
                COALESCE(SUM(t.amount) FILTER (WHERE (t.type = 'EXPENSE' OR (t.type = 'TRANSFER' AND t.account_id = $2)) AND t.occurred_at >= date_trunc('year',  NOW())), 0) AS year_expense,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME' OR (t.type = 'TRANSFER' AND t.to_account_id = $2)),  0) AS all_income,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE' OR (t.type = 'TRANSFER' AND t.account_id = $2)), 0) AS all_expense
               FROM transactions t
              WHERE t.user_id = $1 AND (t.account_id = $2 OR t.to_account_id = $2)`,
            params
        );
    } else {
        buckets = await query(
            `SELECT
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'  AND t.occurred_at >= date_trunc('day',   NOW())), 0) AS day_income,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE' AND t.occurred_at >= date_trunc('day',   NOW())), 0) AS day_expense,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'  AND t.occurred_at >= date_trunc('week',  NOW())), 0) AS week_income,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE' AND t.occurred_at >= date_trunc('week',  NOW())), 0) AS week_expense,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'  AND t.occurred_at >= date_trunc('month', NOW())), 0) AS month_income,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE' AND t.occurred_at >= date_trunc('month', NOW())), 0) AS month_expense,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'  AND t.occurred_at >= date_trunc('year',  NOW())), 0) AS year_income,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE' AND t.occurred_at >= date_trunc('year',  NOW())), 0) AS year_expense,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'),  0) AS all_income,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE'), 0) AS all_expense
               FROM transactions t
              WHERE t.user_id = $1`,
            params
        );
    }

    const balanceQuery = await query(
        accountId
            ? `SELECT (a.opening_balance
                + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'INCOME'), 0)
                + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.to_account_id = a.id AND t.type = 'TRANSFER'), 0)
                - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'EXPENSE'), 0)
                - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'TRANSFER'), 0)
               ) AS balance FROM accounts a WHERE a.user_id = $1 AND a.id = $2`
            : `SELECT SUM(a.opening_balance
                + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'INCOME'), 0)
                + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.to_account_id = a.id AND t.type = 'TRANSFER'), 0)
                - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'EXPENSE'), 0)
                - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'TRANSFER'), 0)
               ) AS balance FROM accounts a WHERE a.user_id = $1 AND a.archived = false`,
        params
    );

    const b = buckets.rows[0];
    const period = (income, expense) => ({
        income: Number(income),
        expense: Number(expense),
        net: Number((Number(income) - Number(expense)).toFixed(2)),
    });

    const balance = Number(balanceQuery.rows[0]?.balance || 0);

    return ok(res, {
        balance: Number(balance.toFixed(2)),
        daily:   period(b.day_income,   b.day_expense),
        weekly:  period(b.week_income,  b.week_expense),
        monthly: period(b.month_income, b.month_expense),
        yearly:  period(b.year_income,  b.year_expense),
        allTime: period(b.all_income,   b.all_expense),
    });
};

module.exports = {
    resolveRange,
    getSummary,
    getTrend,
    getCategoryBreakdown,
    getPaymentMethodBreakdown,
    getCalendar,
    getBudget,
    getOverview,
};
