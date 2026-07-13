// PDF and Excel report generation. Both formats are produced server-side so the
// Flutter app and the web portal get byte-identical reports from one codebase.
//
// The PDF is laid out as an income-tax working paper: a summary block, a
// category breakdown, then the full transaction ledger.

const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { query } = require('../utils/db');
const { fail } = require('../utils/respond');

const BRAND = '#0E7C66';
const INK = '#101828';
const MUTED = '#667085';
const LINE = '#E4E7EC';
const INCOME_COLOR = '#12805C';
const EXPENSE_COLOR = '#D92D20';

const LOGO_PATH = path.resolve(__dirname, '..', '..', '..', 'assets', 'logo.png');

const money = (n, currency = 'BDT') =>
    `${currency} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
    new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtDateTime = (d) =>
    new Date(d).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

const resolveRange = (q) => {
    if (q.from && q.to) return { from: new Date(q.from), to: new Date(q.to) };
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to);
    if (!q.from) {
        switch (q.period) {
            case 'daily':   from.setHours(0, 0, 0, 0); break;
            case 'weekly':  from.setDate(from.getDate() - 7); break;
            case 'yearly':  from.setFullYear(from.getFullYear() - 1); break;
            default:        from.setMonth(from.getMonth() - 1); break;
        }
    }
    return { from, to };
};

// Everything both formats need, fetched once.
const gatherReportData = async (userId, q) => {
    const { from, to } = resolveRange(q);

    const params = [userId, from, to];
    let filter = '';
    if (q.accountId) { params.push(q.accountId); filter += ` AND t.account_id = $${params.length}`; }
    if (q.type)      { params.push(q.type);      filter += ` AND t.type = $${params.length}::transaction_type`; }

    const [user, account, transactions, byCategory, byPaymentMethod] = await Promise.all([
        query(`SELECT name, email, phone, currency FROM users WHERE id = $1`, [userId]),

        q.accountId
            ? query(`SELECT name FROM accounts WHERE id = $1 AND user_id = $2`, [q.accountId, userId])
            : Promise.resolve({ rows: [] }),

        query(
            `SELECT t.id, t.type, t.amount, t.note, t.occurred_at,
                    a.name AS account_name, ta.name AS to_account_name,
                    c.name AS category_name, p.name AS payment_method_name,
                    (SELECT COUNT(*) FROM attachments at WHERE at.transaction_id = t.id) AS attachment_count,
                    (SELECT COUNT(*) FROM transaction_items i WHERE i.transaction_id = t.id) AS item_count
               FROM transactions t
               JOIN accounts a ON a.id = t.account_id
               LEFT JOIN accounts ta ON ta.id = t.to_account_id
               LEFT JOIN categories c ON c.id = t.category_id
               LEFT JOIN payment_methods p ON p.id = t.payment_method_id
              WHERE t.user_id = $1 AND t.occurred_at >= $2 AND t.occurred_at <= $3${filter}
              ORDER BY t.occurred_at DESC`,
            params
        ),

        query(
            `SELECT COALESCE(c.name, 'Uncategorised') AS name, t.type,
                    SUM(t.amount) AS total, COUNT(*)::int AS count
               FROM transactions t
               LEFT JOIN categories c ON c.id = t.category_id
              WHERE t.user_id = $1 AND t.occurred_at >= $2 AND t.occurred_at <= $3
                AND t.type <> 'TRANSFER'${filter}
              GROUP BY c.name, t.type
              ORDER BY total DESC`,
            params
        ),

        query(
            `SELECT COALESCE(p.name, 'Unspecified') AS name,
                    COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'),  0) AS income,
                    COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE'), 0) AS expense,
                    COUNT(*)::int AS count
               FROM transactions t
               LEFT JOIN payment_methods p ON p.id = t.payment_method_id
              WHERE t.user_id = $1 AND t.occurred_at >= $2 AND t.occurred_at <= $3
                AND t.type <> 'TRANSFER'${filter}
              GROUP BY p.name
              ORDER BY (COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'INCOME'), 0)
                      + COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'EXPENSE'), 0)) DESC`,
            params
        ),
    ]);

    const rows = transactions.rows;
    const income = rows.filter((r) => r.type === 'INCOME').reduce((s, r) => s + Number(r.amount), 0);
    const expense = rows.filter((r) => r.type === 'EXPENSE').reduce((s, r) => s + Number(r.amount), 0);

    return {
        user: user.rows[0] || { name: 'User', currency: 'BDT' },
        accountName: account.rows[0]?.name || 'All accounts',
        range: { from, to },
        period: q.period,
        transactions: rows,
        byCategory: byCategory.rows,
        byPaymentMethod: byPaymentMethod.rows,
        totals: {
            income,
            expense,
            net: income - expense,
            count: rows.length,
        },
    };
};

// ------------------------------------------------------------------------- PDF

const buildPdf = (data, res) => {
    const currency = data.user.currency || 'BDT';
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    doc.pipe(res);

    const pageWidth = doc.page.width - 80;
    const left = 40;

    // ---- header
    let headerBottom = 40;
    if (fs.existsSync(LOGO_PATH)) {
        try {
            doc.image(LOGO_PATH, left, 36, { width: 44, height: 44 });
        } catch (_) { /* a bad logo must not kill the report */ }
    }
    doc.font('Helvetica-Bold').fontSize(16).fillColor(INK)
        .text('SISIRBINDU TRACKERAPP', left + 54, 40);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
        .text('Income & Expense Statement', left + 54, 60);

    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(`Generated ${fmtDateTime(new Date())}`, left, 40, { width: pageWidth, align: 'right' })
        .text(data.accountName, left, 52, { width: pageWidth, align: 'right' });

    headerBottom = 92;
    doc.moveTo(left, headerBottom).lineTo(left + pageWidth, headerBottom)
        .lineWidth(1).strokeColor(BRAND).stroke();

    // ---- who / what period
    let y = headerBottom + 16;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(data.user.name, left, y);
    y += 15;
    const contact = [data.user.email, data.user.phone].filter(Boolean).join('  •  ');
    if (contact) {
        doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(contact, left, y);
        y += 13;
    }
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
        .text(`Period: ${fmtDate(data.range.from)} — ${fmtDate(data.range.to)}`, left, y);
    y += 24;

    // ---- summary cards
    const cardW = (pageWidth - 20) / 3;
    const cards = [
        { label: 'Total Income',  value: data.totals.income,  color: INCOME_COLOR },
        { label: 'Total Expense', value: data.totals.expense, color: EXPENSE_COLOR },
        { label: 'Net Balance',   value: data.totals.net,     color: data.totals.net >= 0 ? INCOME_COLOR : EXPENSE_COLOR },
    ];
    cards.forEach((card, i) => {
        const x = left + i * (cardW + 10);
        doc.roundedRect(x, y, cardW, 58, 6).fillAndStroke('#F9FAFB', LINE);
        doc.font('Helvetica').fontSize(8).fillColor(MUTED)
            .text(card.label.toUpperCase(), x + 12, y + 12, { width: cardW - 24, characterSpacing: 0.5 });
        doc.font('Helvetica-Bold').fontSize(13).fillColor(card.color)
            .text(money(card.value, currency), x + 12, y + 28, { width: cardW - 24 });
    });
    y += 78;

    // ---- table helper: a header row that reprints on every page break
    const table = (title, columns, rows, startY) => {
        let cy = startY;

        const ensureRoom = (needed) => {
            if (cy + needed > doc.page.height - 60) {
                doc.addPage();
                cy = 50;
                drawHead();
            }
        };

        const drawHead = () => {
            doc.rect(left, cy, pageWidth, 20).fill('#F2F4F7');
            doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
            let cx = left + 8;
            columns.forEach((col) => {
                doc.text(col.label.toUpperCase(), cx, cy + 6, {
                    width: col.width - 8,
                    align: col.align || 'left',
                    lineBreak: false,
                });
                cx += col.width;
            });
            cy += 20;
        };

        if (title) {
            ensureRoom(40);
            doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(title, left, cy);
            cy += 18;
        }

        drawHead();

        rows.forEach((row, index) => {
            ensureRoom(20);
            if (index % 2 === 1) doc.rect(left, cy, pageWidth, 18).fill('#FCFCFD');

            let cx = left + 8;
            columns.forEach((col) => {
                const value = col.get(row);
                doc.font(col.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
                    .fillColor(col.color ? col.color(row) : INK)
                    .text(String(value ?? ''), cx, cy + 5, {
                        width: col.width - 8,
                        align: col.align || 'left',
                        lineBreak: false,
                        ellipsis: true,
                    });
                cx += col.width;
            });
            cy += 18;
        });

        doc.moveTo(left, cy).lineTo(left + pageWidth, cy).lineWidth(0.5).strokeColor(LINE).stroke();
        return cy + 22;
    };

    // ---- category breakdown
    if (data.byCategory.length) {
        y = table('Category Breakdown', [
            { label: 'Category', width: pageWidth * 0.40, get: (r) => r.name },
            { label: 'Type',     width: pageWidth * 0.18, get: (r) => (r.type === 'INCOME' ? 'Income' : 'Expense'),
              color: (r) => (r.type === 'INCOME' ? INCOME_COLOR : EXPENSE_COLOR) },
            { label: 'Entries',  width: pageWidth * 0.15, get: (r) => r.count, align: 'right' },
            { label: 'Amount',   width: pageWidth * 0.27, get: (r) => money(r.total, currency), align: 'right', bold: true,
              color: (r) => (r.type === 'INCOME' ? INCOME_COLOR : EXPENSE_COLOR) },
        ], data.byCategory, y);
    }

    // ---- payment method breakdown
    if (data.byPaymentMethod.length) {
        y = table('Payment Methods', [
            { label: 'Method',  width: pageWidth * 0.34, get: (r) => r.name },
            { label: 'Entries', width: pageWidth * 0.14, get: (r) => r.count, align: 'right' },
            { label: 'Income',  width: pageWidth * 0.26, get: (r) => money(r.income, currency), align: 'right', color: () => INCOME_COLOR },
            { label: 'Expense', width: pageWidth * 0.26, get: (r) => money(r.expense, currency), align: 'right', color: () => EXPENSE_COLOR },
        ], data.byPaymentMethod, y);
    }

    // ---- the ledger
    if (data.transactions.length) {
        table(`Transactions (${data.transactions.length})`, [
            { label: 'Date',     width: pageWidth * 0.13, get: (r) => fmtDate(r.occurred_at) },
            { label: 'Type',     width: pageWidth * 0.10, get: (r) => r.type.charAt(0) + r.type.slice(1).toLowerCase(),
              color: (r) => (r.type === 'INCOME' ? INCOME_COLOR : r.type === 'EXPENSE' ? EXPENSE_COLOR : MUTED) },
            // PDFKit's built-in Helvetica is WinAnsi-encoded, so '→' renders as
            // garbage. Stick to characters the standard fonts actually carry.
            { label: 'Category', width: pageWidth * 0.17, get: (r) => r.category_name || (r.type === 'TRANSFER' ? `to ${r.to_account_name || ''}` : '-') },
            { label: 'Account',  width: pageWidth * 0.14, get: (r) => r.account_name },
            { label: 'Method',   width: pageWidth * 0.13, get: (r) => r.payment_method_name || '—' },
            { label: 'Note',     width: pageWidth * 0.16, get: (r) => r.note || (Number(r.attachment_count) ? `${r.attachment_count} file(s)` : '—') },
            { label: 'Amount',   width: pageWidth * 0.17, get: (r) => money(r.amount, currency), align: 'right', bold: true,
              color: (r) => (r.type === 'INCOME' ? INCOME_COLOR : r.type === 'EXPENSE' ? EXPENSE_COLOR : INK) },
        ], data.transactions, y);
    } else {
        doc.font('Helvetica').fontSize(10).fillColor(MUTED)
            .text('No transactions in this period.', left, y);
    }

    // ---- page numbers, added after the fact so the total is known
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        doc.font('Helvetica').fontSize(7).fillColor(MUTED)
            .text(
                `SISIRBINDU TRACKERAPP  •  Page ${i + 1} of ${range.count}`,
                left,
                doc.page.height - 34,
                { width: pageWidth, align: 'center' }
            );
    }

    doc.end();
};

// ----------------------------------------------------------------------- Excel

const buildExcel = async (data, res) => {
    const currency = data.user.currency || 'BDT';
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SISIRBINDU TRACKERAPP';
    wb.created = new Date();

    const moneyFormat = `#,##0.00`;
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7C66' } };
    const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

    const styleHeader = (row) => {
        row.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
            cell.border = { bottom: { style: 'thin', color: { argb: 'FFD0D5DD' } } };
        });
        row.height = 22;
    };

    // ---- Summary
    const summary = wb.addWorksheet('Summary', {
        views: [{ showGridLines: false }],
    });
    summary.columns = [{ width: 28 }, { width: 24 }];

    summary.addRow(['SISIRBINDU TRACKERAPP']).font = { bold: true, size: 16, color: { argb: 'FF0E7C66' } };
    summary.addRow(['Income & Expense Statement']).font = { size: 11, color: { argb: 'FF667085' } };
    summary.addRow([]);
    summary.addRow(['Name', data.user.name]);
    if (data.user.email) summary.addRow(['Email', data.user.email]);
    if (data.user.phone) summary.addRow(['Phone', data.user.phone]);
    summary.addRow(['Account', data.accountName]);
    summary.addRow(['Period from', fmtDate(data.range.from)]);
    summary.addRow(['Period to', fmtDate(data.range.to)]);
    summary.addRow(['Generated', fmtDateTime(new Date())]);
    summary.addRow([]);

    const totalsHeader = summary.addRow(['Totals', `Amount (${currency})`]);
    styleHeader(totalsHeader);

    const incomeRow = summary.addRow(['Total Income', data.totals.income]);
    incomeRow.getCell(2).numFmt = moneyFormat;
    incomeRow.getCell(2).font = { bold: true, color: { argb: 'FF12805C' } };

    const expenseRow = summary.addRow(['Total Expense', data.totals.expense]);
    expenseRow.getCell(2).numFmt = moneyFormat;
    expenseRow.getCell(2).font = { bold: true, color: { argb: 'FFD92D20' } };

    const netRow = summary.addRow(['Net Balance', data.totals.net]);
    netRow.getCell(2).numFmt = moneyFormat;
    netRow.getCell(2).font = {
        bold: true,
        color: { argb: data.totals.net >= 0 ? 'FF12805C' : 'FFD92D20' },
    };

    summary.addRow(['Transactions', data.totals.count]);

    // ---- Transactions
    const tx = wb.addWorksheet('Transactions', { views: [{ state: 'frozen', ySplit: 1 }] });
    tx.columns = [
        { header: 'Date',           key: 'date',    width: 20 },
        { header: 'Type',           key: 'type',    width: 12 },
        { header: 'Category',       key: 'cat',     width: 24 },
        { header: 'Account',        key: 'acc',     width: 18 },
        { header: 'To Account',     key: 'to',      width: 18 },
        { header: 'Payment Method', key: 'pm',      width: 18 },
        { header: 'Note',           key: 'note',    width: 36 },
        { header: 'Items',          key: 'items',   width: 8 },
        { header: 'Files',          key: 'files',   width: 8 },
        { header: `Income (${currency})`,  key: 'income',  width: 16 },
        { header: `Expense (${currency})`, key: 'expense', width: 16 },
    ];
    styleHeader(tx.getRow(1));

    data.transactions.forEach((t) => {
        const row = tx.addRow({
            date: new Date(t.occurred_at),
            type: t.type.charAt(0) + t.type.slice(1).toLowerCase(),
            cat: t.category_name || '',
            acc: t.account_name,
            to: t.to_account_name || '',
            pm: t.payment_method_name || '',
            note: t.note || '',
            items: Number(t.item_count) || 0,
            files: Number(t.attachment_count) || 0,
            income: t.type === 'INCOME' ? Number(t.amount) : null,
            expense: t.type === 'EXPENSE' ? Number(t.amount) : null,
        });
        row.getCell('date').numFmt = 'dd mmm yyyy hh:mm';
        row.getCell('income').numFmt = moneyFormat;
        row.getCell('expense').numFmt = moneyFormat;
        row.getCell('income').font = { color: { argb: 'FF12805C' } };
        row.getCell('expense').font = { color: { argb: 'FFD92D20' } };
    });

    // Live SUM formulas, not baked numbers — the lawyer can filter rows and the
    // totals still recompute in Excel.
    if (data.transactions.length) {
        const last = tx.rowCount;
        const totalRow = tx.addRow({
            note: 'TOTAL',
            income: { formula: `SUM(J2:J${last})` },
            expense: { formula: `SUM(K2:K${last})` },
        });
        totalRow.font = { bold: true };
        totalRow.getCell('income').numFmt = moneyFormat;
        totalRow.getCell('expense').numFmt = moneyFormat;
        totalRow.eachCell((cell) => {
            cell.border = { top: { style: 'double', color: { argb: 'FF0E7C66' } } };
        });
    }
    tx.autoFilter = { from: 'A1', to: `K1` };

    // ---- Categories
    const cats = wb.addWorksheet('Categories', { views: [{ state: 'frozen', ySplit: 1 }] });
    cats.columns = [
        { header: 'Category', key: 'name',  width: 30 },
        { header: 'Type',     key: 'type',  width: 12 },
        { header: 'Entries',  key: 'count', width: 10 },
        { header: `Total (${currency})`, key: 'total', width: 18 },
    ];
    styleHeader(cats.getRow(1));
    data.byCategory.forEach((c) => {
        const row = cats.addRow({
            name: c.name,
            type: c.type.charAt(0) + c.type.slice(1).toLowerCase(),
            count: c.count,
            total: Number(c.total),
        });
        row.getCell('total').numFmt = moneyFormat;
        row.getCell('total').font = {
            bold: true,
            color: { argb: c.type === 'INCOME' ? 'FF12805C' : 'FFD92D20' },
        };
    });

    // ---- Payment methods
    const pms = wb.addWorksheet('Payment Methods', { views: [{ state: 'frozen', ySplit: 1 }] });
    pms.columns = [
        { header: 'Method',  key: 'name',    width: 26 },
        { header: 'Entries', key: 'count',   width: 10 },
        { header: `Income (${currency})`,  key: 'income',  width: 18 },
        { header: `Expense (${currency})`, key: 'expense', width: 18 },
    ];
    styleHeader(pms.getRow(1));
    data.byPaymentMethod.forEach((p) => {
        const row = pms.addRow({
            name: p.name,
            count: p.count,
            income: Number(p.income),
            expense: Number(p.expense),
        });
        row.getCell('income').numFmt = moneyFormat;
        row.getCell('expense').numFmt = moneyFormat;
    });

    await wb.xlsx.write(res);
};

// GET /api/reports/export?format=pdf|excel&period=&from=&to=&accountId=&type=
const exportReport = async (req, res) => {
    const q = req.validQuery;
    const data = await gatherReportData(req.userId, q);

    const stamp = new Date().toISOString().slice(0, 10);
    const base = `SisirBindu-Statement-${stamp}`;

    if (q.format === 'excel') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
        await buildExcel(data, res);
        return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
    buildPdf(data, res);
};

/**
 * The same PDF, as a Buffer instead of an HTTP response.
 *
 * buildPdf() pipes into any writable stream, so this collects the chunks rather
 * than reimplementing the layout — the emailed statement is byte-identical to the
 * downloaded one, which is the whole point.
 */
const renderPdfBuffer = async (userId, q) => {
    const data = await gatherReportData(userId, q);

    return new Promise((resolve, reject) => {
        const chunks = [];
        const sink = new (require('stream').Writable)({
            write(chunk, _enc, cb) {
                chunks.push(chunk);
                cb();
            },
        });
        sink.on('finish', () => resolve({ buffer: Buffer.concat(chunks), data }));
        sink.on('error', reject);

        try {
            buildPdf(data, sink);
        } catch (err) {
            reject(err);
        }
    });
};

module.exports = { exportReport, gatherReportData, renderPdfBuffer };
