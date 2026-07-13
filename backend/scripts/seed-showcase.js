// Seeds a realistic year of activity for one showcase account.
//
//   node backend/scripts/seed-showcase.js 01811567119
//
// Goes through the real controllers' tables the same way the app does — accounts,
// categories, transactions with line items, attachments, budgets — so what you see
// in the app is exactly what the app would have produced. Re-running wipes only
// this user's tracker data and rebuilds it; the user row itself is left alone.

const path = require('path');
const fs = require('fs');
const envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
require('dotenv').config({ path: path.resolve(__dirname, '..', envFile) });

const { query, withTransaction } = require('../src/utils/db');
const { buildCanonicalPhone } = require('../src/utils/phone');
const { UPLOAD_ROOT } = require('../src/middleware/upload');

const IDENTIFIER = process.argv[2] || '01811567119';

// A Dhaka advocate's practice: fees are lumpy and large, expenses are frequent and small.
const INCOME_PLAN = [
    { cat: 'Business', pm: 'Bank',  note: 'Case fee — Dhaka Judge Court, land dispute',    min: 45000, max: 90000, perMonth: 2 },
    { cat: 'Business', pm: 'Cash',  note: 'Consultation fee — client meeting',              min: 3000,  max: 8000,  perMonth: 4 },
    { cat: 'Business', pm: 'bKash', note: 'Retainer — corporate client',                    min: 15000, max: 30000, perMonth: 1 },
    { cat: 'Salary',   pm: 'Bank',  note: 'Law chamber partnership draw',                   min: 40000, max: 40000, perMonth: 1 },
    { cat: 'Investment Income', pm: 'Bank', note: 'FDR interest credited',                  min: 4000,  max: 6500,  perMonth: 0.34 },
    { cat: 'Bonus',    pm: 'Bank',  note: 'Success fee — appeal won',                       min: 25000, max: 60000, perMonth: 0.25 },
];

const EXPENSE_PLAN = [
    { cat: 'Rent',            pm: 'Bank',  note: 'Chamber rent — Paltan',            min: 22000, max: 22000, perMonth: 1 },
    { cat: 'Taxes',           pm: 'Bank',  note: 'Advance income tax instalment',    min: 12000, max: 18000, perMonth: 0.34 },
    { cat: 'Stationary',      pm: 'Cash',  note: 'Case files, affidavit paper, seals', min: 800, max: 2600, perMonth: 3 },
    { cat: 'Transportation',  pm: 'Cash',  note: 'Court transport',                  min: 150,  max: 600,   perMonth: 12 },
    { cat: 'Fuel',            pm: 'Card',  note: 'Fuel — chamber car',               min: 2500, max: 4500,  perMonth: 2 },
    { cat: 'Mobile',          pm: 'bKash', note: 'Mobile recharge',                  min: 300,  max: 700,   perMonth: 2 },
    { cat: 'Internet',        pm: 'Bank',  note: 'Chamber broadband',                min: 1200, max: 1200,  perMonth: 1 },
    { cat: 'Electricity',     pm: 'bKash', note: 'Chamber electricity bill',         min: 1800, max: 4200,  perMonth: 1 },
    { cat: 'Food',            pm: 'Cash',  note: 'Lunch near court',                 min: 120,  max: 450,   perMonth: 14 },
    { cat: 'Restaurant and Hotel', pm: 'Card', note: 'Client lunch meeting',         min: 900,  max: 3200,  perMonth: 2 },
    { cat: 'Maid/Servant',    pm: 'Cash',  note: 'Chamber assistant salary',         min: 8000, max: 8000,  perMonth: 1 },
    { cat: 'Groceries',       pm: 'Card',  note: 'Monthly groceries',                min: 4500, max: 9000,  perMonth: 2 },
    { cat: 'Education',       pm: 'Bank',  note: "Children's school fees",           min: 9000, max: 9000,  perMonth: 1 },
    { cat: 'Health',          pm: 'Cash',  note: 'Doctor consultation',              min: 800,  max: 2500,  perMonth: 0.5 },
    { cat: 'Medicine',        pm: 'Cash',  note: 'Pharmacy',                         min: 350,  max: 1400,  perMonth: 1.5 },
    { cat: 'Bar Council Fees', pm: 'Bank', note: 'Bar association subscription',     min: 3000, max: 5000,  perMonth: 0.25 },
    { cat: 'Court Fees',      pm: 'Cash',  note: 'Court fee stamps & filing',        min: 500,  max: 3500,  perMonth: 5 },
    { cat: 'Cloths',          pm: 'Card',  note: 'Court gown / formal wear',         min: 2000, max: 6000,  perMonth: 0.2 },
    { cat: 'Gifts',           pm: 'Cash',  note: 'Eid gifts for staff',              min: 3000, max: 7000,  perMonth: 0.17 },
    { cat: 'Car',            pm: 'Card',  note: 'Car servicing',                    min: 3500, max: 9000,  perMonth: 0.25 },
];

// A few categories a lawyer needs that aren't in the README's preset list. The app
// lets users add their own; this is what that looks like in the data.
const CUSTOM_EXPENSE_CATEGORIES = [
    { name: 'Court Fees',       icon: 'taxes',      color: '#B91C1C' },
    { name: 'Bar Council Fees', icon: 'insurance',  color: '#0E7C66' },
];
const CUSTOM_PAYMENT_METHODS = [
    { name: 'bKash', icon: 'mobile', color: '#E2136E' },
    { name: 'Nagad', icon: 'mobile', color: '#F6921E' },
];

// Itemised bills, so the "Add Items" grid has something real behind it.
const ITEMISED = {
    'Case files, affidavit paper, seals': [
        { name: 'Case file folder', quantity: 12, unit: 'pcs',  rate: 45 },
        { name: 'Affidavit paper',  quantity: 2,  unit: 'ream', rate: 380 },
        { name: 'Rubber seal',      quantity: 1,  unit: 'pcs',  rate: 250 },
    ],
    'Court fee stamps & filing': [
        { name: 'Court fee stamp', quantity: 4, unit: 'pcs', rate: 300 },
        { name: 'Filing charge',   quantity: 1, unit: 'set', rate: 500 },
    ],
    'Monthly groceries': [
        { name: 'Rice',       quantity: 25, unit: 'kg',  rate: 78 },
        { name: 'Cooking oil', quantity: 5, unit: 'ltr', rate: 165 },
        { name: 'Lentils',    quantity: 4,  unit: 'kg',  rate: 140 },
        { name: 'Vegetables', quantity: 1,  unit: 'lot', rate: 850 },
    ],
};

const rand = (min, max) => Math.round((min + Math.random() * (max - min)) * 100) / 100;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// A real ledger clusters on weekdays — court doesn't sit on Friday.
const randomDayIn = (year, month) => {
    const days = new Date(year, month + 1, 0).getDate();
    for (let attempt = 0; attempt < 12; attempt++) {
        const day = 1 + Math.floor(Math.random() * days);
        const d = new Date(year, month, day, 9 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60));
        if (d.getDay() !== 5 && d <= new Date()) return d;   // 5 = Friday
    }
    return new Date(year, month, Math.min(15, days), 11, 0);
};

// Deterministic little files so the Drive and the attachment previews aren't empty.
const makeAttachmentBytes = (kind, label) => {
    if (kind === 'PDF') {
        // A minimal but genuinely valid single-page PDF.
        const text = label.slice(0, 60).replace(/[()\\]/g, '');
        const content = `BT /F1 14 Tf 60 760 Td (${text}) Tj ET`;
        const objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
            `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        ];
        let pdf = '%PDF-1.4\n';
        const offsets = [];
        objects.forEach((body, i) => {
            offsets.push(pdf.length);
            pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
        });
        const xref = pdf.length;
        pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
        offsets.forEach((o) => { pdf += `${String(o).padStart(10, '0')} 00000 n \n`; });
        pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
        return Buffer.from(pdf, 'latin1');
    }

    if (kind === 'IMAGE') {
        // 1x1 PNG — enough for a real thumbnail without shipping binaries in git.
        return Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64'
        );
    }

    // A tiny but structurally valid WAV.
    const samples = 8000;
    const buf = Buffer.alloc(44 + samples * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22); buf.writeUInt32LE(8000, 24); buf.writeUInt32LE(16000, 28);
    buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36); buf.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) {
        buf.writeInt16LE(Math.round(Math.sin(i / 12) * 5000), 44 + i * 2);
    }
    return buf;
};

const ATTACHMENT_PLAN = [
    { kind: 'PDF',   ext: '.pdf',  mime: 'application/pdf', name: (n) => `${n.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-receipt.pdf` },
    { kind: 'IMAGE', ext: '.png',  mime: 'image/png',       name: (n) => `${n.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-bill.png` },
    { kind: 'AUDIO', ext: '.wav',  mime: 'audio/wav',       name: () => `client-voice-note.wav` },
];

const main = async () => {
    const canonical = buildCanonicalPhone(IDENTIFIER);
    const found = await query(
        `SELECT id, name FROM users WHERE phone = $1 OR email = $2`,
        [canonical ? canonical.phone : null, IDENTIFIER.toLowerCase()]
    );
    if (!found.rows.length) {
        console.error(`No user for "${IDENTIFIER}". Register the account first.`);
        process.exit(1);
    }
    const user = found.rows[0];
    console.log(`Seeding showcase data for ${user.name} (${IDENTIFIER})`);

    // Idempotent: wipe this user's tracker data, keep the account itself.
    await query(`DELETE FROM transactions WHERE user_id = $1`, [user.id]);
    await query(`DELETE FROM attachments  WHERE user_id = $1`, [user.id]);
    await query(`DELETE FROM budgets      WHERE user_id = $1`, [user.id]);
    await query(`DELETE FROM accounts     WHERE user_id = $1`, [user.id]);

    // ---- accounts
    const accounts = {};
    for (const [name, opening, isDefault] of [
        ['Personal',        45000,  true],
        ['Chamber Account', 180000, false],
        ['Cash in Hand',    12000,  false],
    ]) {
        const r = await query(
            `INSERT INTO accounts (user_id, name, opening_balance, is_default, icon, color)
             VALUES ($1, $2, $3, $4, 'wallet', '#0E7C66') RETURNING id`,
            [user.id, name, opening, isDefault]
        );
        accounts[name] = r.rows[0].id;
    }
    console.log(`  accounts: ${Object.keys(accounts).join(', ')}`);

    // ---- custom taxonomy on top of the presets already seeded at registration
    for (const c of CUSTOM_EXPENSE_CATEGORIES) {
        await query(
            `INSERT INTO categories (user_id, type, name, icon, color, is_default)
             VALUES ($1, 'EXPENSE', $2, $3, $4, false)
             ON CONFLICT (user_id, type, name) DO NOTHING`,
            [user.id, c.name, c.icon, c.color]
        );
    }
    for (const p of CUSTOM_PAYMENT_METHODS) {
        await query(
            `INSERT INTO payment_methods (user_id, name, icon, color, is_default)
             VALUES ($1, $2, $3, $4, false)
             ON CONFLICT (user_id, name) DO NOTHING`,
            [user.id, p.name, p.icon, p.color]
        );
    }

    const catRows = await query(`SELECT id, name, type FROM categories WHERE user_id = $1`, [user.id]);
    const pmRows = await query(`SELECT id, name FROM payment_methods WHERE user_id = $1`, [user.id]);
    const cat = (name, type) => catRows.rows.find((c) => c.name === name && c.type === type)?.id ?? null;
    const pm = (name) => pmRows.rows.find((p) => p.name === name)?.id ?? null;

    // ---- 12 months of transactions
    const now = new Date();
    const created = [];

    for (let back = 11; back >= 0; back--) {
        const anchor = new Date(now.getFullYear(), now.getMonth() - back, 1);
        const year = anchor.getFullYear();
        const month = anchor.getMonth();

        for (const [type, plan] of [['INCOME', INCOME_PLAN], ['EXPENSE', EXPENSE_PLAN]]) {
            for (const line of plan) {
                // perMonth < 1 means "some months only".
                const times = line.perMonth >= 1
                    ? Math.round(line.perMonth)
                    : (Math.random() < line.perMonth ? 1 : 0);

                for (let i = 0; i < times; i++) {
                    const when = randomDayIn(year, month);
                    if (when > now) continue;

                    const categoryId = cat(line.cat, type);
                    if (!categoryId) continue;

                    // Cash lands in Cash in Hand; the chamber's money runs through
                    // the Chamber Account; everything else is Personal.
                    const accountId =
                        line.pm === 'Cash' ? accounts['Cash in Hand']
                        : (line.note.includes('Chamber') || line.cat === 'Business' || line.cat === 'Rent')
                            ? accounts['Chamber Account']
                            : accounts['Personal'];

                    created.push({
                        type,
                        accountId,
                        amount: rand(line.min, line.max),
                        categoryId,
                        paymentMethodId: pm(line.pm),
                        note: line.note,
                        occurredAt: when,
                        items: ITEMISED[line.note] || null,
                        recurrence: ['Chamber rent — Paltan', 'Chamber broadband', 'Chamber assistant salary'].includes(line.note)
                            ? 'MONTHLY' : 'NONE',
                    });
                }
            }
        }
    }

    // Monthly draw from the chamber into the personal account.
    for (let back = 5; back >= 0; back -= 2) {
        const when = randomDayIn(now.getFullYear(), now.getMonth() - back);
        if (when > now) continue;
        created.push({
            type: 'TRANSFER',
            accountId: accounts['Chamber Account'],
            toAccountId: accounts['Personal'],
            amount: rand(25000, 45000),
            categoryId: null,
            paymentMethodId: null,
            note: 'Monthly draw from chamber to personal',
            occurredAt: when,
            items: null,
            recurrence: 'NONE',
        });
    }

    // Cash spending has to come from somewhere. Without a matching withdrawal each
    // month, "Cash in Hand" drifts steadily negative — which is nonsense for a cash
    // wallet and made the balance card read -140,098 on the first run.
    for (let back = 11; back >= 0; back--) {
        const anchor = new Date(now.getFullYear(), now.getMonth() - back, 1);
        const cashOut = created
            .filter((t) =>
                t.accountId === accounts['Cash in Hand'] &&
                t.type === 'EXPENSE' &&
                t.occurredAt.getFullYear() === anchor.getFullYear() &&
                t.occurredAt.getMonth() === anchor.getMonth())
            .reduce((s, t) => s + t.amount, 0);
        if (cashOut <= 0) continue;

        // Draw a round sum at the start of the month, comfortably covering it.
        const when = new Date(anchor.getFullYear(), anchor.getMonth(), 2, 10, 30);
        if (when > now) continue;
        created.push({
            type: 'TRANSFER',
            accountId: accounts['Chamber Account'],
            toAccountId: accounts['Cash in Hand'],
            amount: Math.ceil((cashOut * 1.15) / 1000) * 1000,
            categoryId: null,
            paymentMethodId: null,
            note: 'Cash withdrawal for chamber & court expenses',
            occurredAt: when,
            items: null,
            recurrence: 'NONE',
        });
    }

    created.sort((a, b) => a.occurredAt - b.occurredAt);

    let itemCount = 0;
    for (const t of created) {
        await withTransaction(async (client) => {
            const r = await client.query(
                `INSERT INTO transactions
                    (user_id, account_id, to_account_id, type, amount, category_id,
                     payment_method_id, note, occurred_at, recurrence, next_run_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                 RETURNING id`,
                [
                    user.id, t.accountId, t.toAccountId || null, t.type, t.amount,
                    t.categoryId, t.paymentMethodId, t.note, t.occurredAt, t.recurrence,
                    // A live recurring row needs a future next_run_at or the cron
                    // would immediately backfill a year of duplicates.
                    t.recurrence === 'MONTHLY'
                        ? new Date(now.getFullYear(), now.getMonth() + 1, 5)
                        : null,
                ]
            );
            t.id = r.rows[0].id;

            if (t.items) {
                itemCount += t.items.length;
                const values = [];
                const params = [];
                let i = 1;
                t.items.forEach((item, index) => {
                    values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
                    params.push(t.id, item.name, item.quantity, item.unit, item.rate, index);
                });
                await client.query(
                    `INSERT INTO transaction_items (transaction_id, name, quantity, unit, rate, position)
                     VALUES ${values.join(', ')}`,
                    params
                );
            }
        });
    }
    console.log(`  transactions: ${created.length} (${itemCount} line items) across 12 months`);

    // ---- attachments on the most recent, most "documentary" transactions
    const dir = path.join(UPLOAD_ROOT, user.id);
    fs.mkdirSync(dir, { recursive: true });

    const documentable = created
        .filter((t) => t.type !== 'TRANSFER')
        .slice(-40)
        .filter((_, i) => i % 3 === 0);

    let attached = 0;
    for (const t of documentable) {
        const spec = pick(ATTACHMENT_PLAN);
        const bytes = makeAttachmentBytes(spec.kind, t.note);
        const stored = `${require('crypto').randomUUID()}${spec.ext}`;
        fs.writeFileSync(path.join(dir, stored), bytes);

        await query(
            `INSERT INTO attachments
                (user_id, transaction_id, kind, original_name, stored_path, mime, size_bytes, duration_ms, created_at)
             VALUES ($1,$2,$3::attachment_kind,$4,$5,$6,$7,$8,$9)`,
            [
                user.id, t.id, spec.kind, spec.name(t.note),
                path.join(user.id, stored), spec.mime, bytes.length,
                spec.kind === 'AUDIO' ? 1000 : null,
                t.occurredAt,
            ]
        );
        attached += 1;
    }
    console.log(`  attachments: ${attached} (PDF receipts, photo bills, voice notes)`);

    // ---- budgets
    const overall = 95000;
    await query(
        `INSERT INTO budgets (user_id, category_id, period, amount) VALUES ($1, NULL, 'MONTHLY', $2)`,
        [user.id, overall]
    );
    for (const [name, amount] of [
        ['Food', 8000], ['Transportation', 6000], ['Groceries', 12000],
        ['Fuel', 9000], ['Court Fees', 10000],
    ]) {
        const id = cat(name, 'EXPENSE');
        if (id) {
            await query(
                `INSERT INTO budgets (user_id, category_id, period, amount) VALUES ($1, $2, 'MONTHLY', $3)`,
                [user.id, id, amount]
            );
        }
    }
    console.log(`  budgets: overall ${overall} + 5 category budgets`);

    // ---- a couple of notifications so the bell isn't empty
    await query(`DELETE FROM notifications WHERE user_id = $1`, [user.id]);
    await query(
        `INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES
            ($1, 'BUDGET_ALERT', 'Budget nearly spent', 'You have used 87% of your Food budget this month.', false, NOW() - INTERVAL '2 hours'),
            ($1, 'RECURRING', 'Recurring expense recorded', 'Chamber rent of 22,000.00 was added automatically.', false, NOW() - INTERVAL '1 day'),
            ($1, 'ADMIN_BROADCAST', 'Tax season', 'Export your yearly statement before 30 November.', true, NOW() - INTERVAL '4 days')`,
        [user.id]
    );

    // ---- what it all adds up to
    const totals = await query(
        `SELECT
            COALESCE(SUM(amount) FILTER (WHERE type='INCOME'), 0)  AS income,
            COALESCE(SUM(amount) FILTER (WHERE type='EXPENSE'), 0) AS expense,
            COUNT(*) FILTER (WHERE type='INCOME')  AS n_income,
            COUNT(*) FILTER (WHERE type='EXPENSE') AS n_expense,
            COUNT(*) FILTER (WHERE type='TRANSFER') AS n_transfer
         FROM transactions WHERE user_id = $1`,
        [user.id]
    );
    const t = totals.rows[0];
    const opening = 45000 + 180000 + 12000;
    const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    console.log('');
    console.log(`  Income  (${t.n_income} entries):  BDT ${fmt(t.income)}`);
    console.log(`  Expense (${t.n_expense} entries): BDT ${fmt(t.expense)}`);
    console.log(`  Transfers: ${t.n_transfer}`);
    console.log(`  Balance: BDT ${fmt(opening + Number(t.income) - Number(t.expense))}`);
    console.log('');
    console.log('Done.');
    process.exit(0);
};

main().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
