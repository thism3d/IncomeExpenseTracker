const cron = require('node-cron');
const { query, withTransaction } = require('../utils/db');
const { purgeExpiredOtps } = require('../utils/otp');
const { notify: deliver } = require('./notify');
const { gatherReportData } = require('../controllers/exportController');

// Thin adapter so the existing call sites keep reading naturally. Everything now
// flows through the one delivery path: DB row -> live socket -> web push -> email
// (for the types worth interrupting someone over).
const notify = (userId, type, title, message, data) =>
    deliver({ userId, type, title, message, data });

const advance = (from, recurrence) => {
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

// Materialise every recurring transaction whose next_run_at has come due. The
// template row keeps its recurrence and just moves next_run_at forward; the
// generated row is a plain one-off pointing back at the template via parent_id.
const runRecurring = async () => {
    const due = await query(
        `SELECT * FROM transactions
          WHERE recurrence <> 'NONE'
            AND next_run_at IS NOT NULL
            AND next_run_at <= NOW()
            AND (recurrence_end IS NULL OR next_run_at::date <= recurrence_end)
          LIMIT 500`
    );
    if (!due.rows.length) return 0;

    let generated = 0;
    for (const t of due.rows) {
        try {
            await withTransaction(async (client) => {
                const inserted = await client.query(
                    `INSERT INTO transactions
                        (user_id, account_id, to_account_id, type, amount, category_id, payment_method_id,
                         note, occurred_at, recurrence, parent_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'NONE', $10)
                     RETURNING id`,
                    [
                        t.user_id, t.account_id, t.to_account_id, t.type, t.amount,
                        t.category_id, t.payment_method_id, t.note, t.next_run_at, t.id,
                    ]
                );

                // Copy the template's line items onto the generated row.
                await client.query(
                    `INSERT INTO transaction_items (transaction_id, name, quantity, unit, rate, position)
                     SELECT $1, name, quantity, unit, rate, position
                       FROM transaction_items WHERE transaction_id = $2`,
                    [inserted.rows[0].id, t.id]
                );

                const next = advance(t.next_run_at, t.recurrence);
                const past = t.recurrence_end && next && next > new Date(t.recurrence_end);
                await client.query(
                    `UPDATE transactions
                        SET next_run_at = $1, recurrence = $2, updated_at = NOW()
                      WHERE id = $3`,
                    // The series is over — stop it recurring rather than leaving a
                    // dangling next_run_at that never fires.
                    past ? [null, 'NONE', t.id] : [next, t.recurrence, t.id]
                );
            });

            generated += 1;
            await notify(
                t.user_id,
                'RECURRING',
                `Recurring ${t.type.toLowerCase()} recorded`,
                `A recurring ${t.type.toLowerCase()} of ${Number(t.amount).toFixed(2)} was added automatically.`,
                { transactionId: t.id }
            );
        } catch (err) {
            console.error(`Recurring transaction ${t.id} failed:`, err.message);
        }
    }
    return generated;
};

// Fire the reminders the user set on a transaction ("Set Reminder" in the README).
const runReminders = async () => {
    const due = await query(
        `SELECT t.*, c.name AS category_name
           FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.reminder_at IS NOT NULL
            AND t.reminder_sent = false
            AND t.reminder_at <= NOW()
          LIMIT 500`
    );

    for (const t of due.rows) {
        try {
            await notify(
                t.user_id,
                'REMINDER',
                'Payment reminder',
                `Reminder: ${t.category_name || t.type.toLowerCase()} of ${Number(t.amount).toFixed(2)}${t.note ? ` — ${t.note}` : ''}`,
                { transactionId: t.id }
            );
            await query(`UPDATE transactions SET reminder_sent = true WHERE id = $1`, [t.id]);
        } catch (err) {
            console.error(`Reminder for ${t.id} failed:`, err.message);
        }
    }
    return due.rows.length;
};

// Warn once a user crosses 90% of a monthly budget.
const runBudgetAlerts = async () => {
    const breached = await query(
        `WITH spend AS (
            SELECT user_id, category_id, SUM(amount) AS spent
              FROM transactions
             WHERE type = 'EXPENSE' AND occurred_at >= date_trunc('month', NOW())
             GROUP BY user_id, category_id
         )
         SELECT b.user_id, b.amount, c.name AS category_name,
                COALESCE(
                    CASE WHEN b.category_id IS NULL
                         THEN (SELECT SUM(spent) FROM spend s WHERE s.user_id = b.user_id)
                         ELSE (SELECT spent FROM spend s WHERE s.user_id = b.user_id AND s.category_id = b.category_id)
                    END, 0) AS spent
           FROM budgets b
           LEFT JOIN categories c ON c.id = b.category_id
          WHERE b.period = 'MONTHLY' AND b.amount > 0`
    );

    for (const b of breached.rows) {
        const spent = Number(b.spent);
        const budget = Number(b.amount);
        if (budget <= 0 || spent < budget * 0.9) continue;

        const label = b.category_name || 'your overall';
        const over = spent > budget;

        // One alert per budget per month — don't nag on every tick.
        const already = await query(
            `SELECT id FROM notifications
              WHERE user_id = $1 AND type = 'BUDGET_ALERT'
                AND created_at >= date_trunc('month', NOW())
                AND data->>'category' IS NOT DISTINCT FROM $2`,
            [b.user_id, b.category_name || null]
        );
        if (already.rows.length) continue;

        await notify(
            b.user_id,
            'BUDGET_ALERT',
            over ? 'Budget exceeded' : 'Budget nearly spent',
            over
                ? `You have spent ${spent.toFixed(2)} against a ${budget.toFixed(2)} budget for ${label}.`
                : `You have used ${((spent / budget) * 100).toFixed(0)}% of your ${label} budget.`,
            { category: b.category_name || null, spent, budget }
        );
    }
    return breached.rowCount;
};

/**
 * The monthly statement, emailed with the PDF attached.
 *
 * Runs on the 1st for the month that just closed — the period a lawyer actually
 * wants for their books. Only users with an email and some activity get one; an
 * empty statement is noise.
 */
const runMonthlySummary = async () => {
    const { renderPdfBuffer } = require('../controllers/exportController');

    // The month that just ended.
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const label = from.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    const recipients = await query(
        `SELECT u.id, u.name, u.email
           FROM users u
          WHERE u.is_admin = false
            AND u.email IS NOT NULL
            AND u.status = 'ACTIVE'
            AND EXISTS (
                SELECT 1 FROM transactions t
                 WHERE t.user_id = u.id
                   AND t.occurred_at >= $1 AND t.occurred_at <= $2
            )`,
        [from, to]
    );

    let sent = 0;
    for (const user of recipients.rows) {
        try {
            const { buffer, data } = await renderPdfBuffer(user.id, {
                format: 'pdf',
                period: 'custom',
                from,
                to,
            });

            const money = (n) =>
                `BDT ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

            await deliver({
                userId: user.id,
                type: 'MONTHLY_SUMMARY',
                title: `Your ${label} statement`,
                message:
                    `Income ${money(data.totals.income)} · ` +
                    `Expense ${money(data.totals.expense)} · ` +
                    `Net ${money(data.totals.net)}. ` +
                    `The full statement is attached as a PDF.`,
                data: { period: label, url: '/reports' },
                attachments: [
                    {
                        filename: `SisirBindu-Statement-${from.toISOString().slice(0, 7)}.pdf`,
                        content: buffer,
                        contentType: 'application/pdf',
                    },
                ],
            });
            sent += 1;
        } catch (err) {
            console.error(`Monthly summary for ${user.id} failed:`, err.message);
        }
    }
    return sent;
};

const startCronJobs = () => {
    // Every 15 minutes: due recurring entries and reminders.
    cron.schedule('*/15 * * * *', async () => {
        try {
            const recurring = await runRecurring();
            const reminders = await runReminders();
            if (recurring || reminders) {
                console.log(`Cron: ${recurring} recurring, ${reminders} reminder(s)`);
            }
        } catch (err) {
            console.error('Cron (recurring/reminders) failed:', err.message);
        }
    });

    // Daily at 09:00 Dhaka time: budget alerts, then sweep dead OTP rows.
    cron.schedule('0 9 * * *', async () => {
        try {
            await runBudgetAlerts();
            const purged = await purgeExpiredOtps();
            if (purged) console.log(`Cron: purged ${purged} expired OTP row(s)`);
        } catch (err) {
            console.error('Cron (daily) failed:', err.message);
        }
    }, { timezone: 'Asia/Dhaka' });

    // 1st of the month, 08:00 Dhaka: last month's statement, emailed with the PDF.
    cron.schedule('0 8 1 * *', async () => {
        try {
            const sent = await runMonthlySummary();
            console.log(`Cron: monthly statement emailed to ${sent} user(s)`);
        } catch (err) {
            console.error('Cron (monthly summary) failed:', err.message);
        }
    }, { timezone: 'Asia/Dhaka' });

    console.log('Cron jobs scheduled');
};

module.exports = {
    startCronJobs,
    runRecurring,
    runReminders,
    runBudgetAlerts,
    runMonthlySummary,
    notify,
};
