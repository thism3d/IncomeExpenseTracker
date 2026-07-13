const fs = require('fs');
const path = require('path');
const { query } = require('../utils/db');
const { ok, created, fail } = require('../utils/respond');
const { UPLOAD_ROOT, kindFor } = require('../middleware/upload');

const shape = (a) => ({
    id: a.id,
    transactionId: a.transaction_id,
    kind: a.kind,
    name: a.original_name,
    mime: a.mime,
    size: Number(a.size_bytes),
    durationMs: a.duration_ms,
    url: `/api/files/${a.id}`,
    createdAt: a.created_at,
    topic: a.topic,
    // Present only on Drive listings, so a file can be traced back to its entry.
    transaction: a.tx_id
        ? {
            id: a.tx_id,
            type: a.tx_type,
            amount: Number(a.tx_amount),
            note: a.tx_note,
            occurredAt: a.tx_occurred_at,
            categoryName: a.tx_category_name,
        }
        : null,
});

// POST /api/files   (multipart: files[], optional transactionId, durationMs, topic, createdAt)
// Files can be uploaded before the transaction exists — the client then passes
// the returned ids as attachmentIds when it saves the transaction.
const uploadFiles = async (req, res) => {
    if (!req.files || !req.files.length) {
        return fail(res, 400, 'NO_FILES', 'No files were uploaded');
    }

    const { transactionId, durationMs, topic, createdAt } = req.body;

    if (transactionId) {
        const owns = await query(
            `SELECT id FROM transactions WHERE id = $1 AND user_id = $2`,
            [transactionId, req.userId]
        );
        if (!owns.rows.length) {
            // Don't leave orphaned bytes behind on a rejected request.
            req.files.forEach((f) => fs.unlink(f.path, () => {}));
            return fail(res, 404, 'NOT_FOUND', 'Transaction not found');
        }
    }

    const saved = [];
    for (const file of req.files) {
        const kind = kindFor(file.mimetype, file.originalname) || 'OTHER';
        // Store the path relative to the upload root, so the root can move
        // (dev vs server) without rewriting every row.
        const relative = path.relative(UPLOAD_ROOT, file.path);

        const inserted = await query(
            `INSERT INTO attachments
                (user_id, transaction_id, kind, original_name, stored_path, mime, size_bytes, duration_ms, topic, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()))
             RETURNING *`,
            [
                req.userId,
                transactionId || null,
                kind,
                file.originalname,
                relative,
                file.mimetype || 'application/octet-stream',
                file.size,
                kind === 'AUDIO' && durationMs ? parseInt(durationMs, 10) || null : null,
                topic || null,
                createdAt || null,
            ]
        );
        saved.push(shape(inserted.rows[0]));
    }

    return created(res, { attachments: saved }, `${saved.length} file(s) uploaded`);
};

// GET /api/files/:id   — streams the bytes (this is what previews/downloads hit)
const getFile = async (req, res) => {
    const result = await query(
        `SELECT * FROM attachments WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.userId]
    );
    if (!result.rows.length) return fail(res, 404, 'NOT_FOUND', 'File not found');
    const file = result.rows[0];

    const absolute = path.resolve(UPLOAD_ROOT, file.stored_path);
    // stored_path comes from our own writer, but resolve it and re-check anyway —
    // a path outside the upload root must never be served.
    if (!absolute.startsWith(UPLOAD_ROOT + path.sep)) {
        return fail(res, 403, 'FORBIDDEN', 'Invalid file path');
    }
    if (!fs.existsSync(absolute)) {
        return fail(res, 404, 'NOT_FOUND', 'File is no longer on disk');
    }

    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Length', file.size_bytes);
    // `download=1` forces a save dialog; otherwise the browser previews inline.
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(file.original_name)}"`);
    res.setHeader('Cache-Control', 'private, max-age=86400');

    return fs.createReadStream(absolute).pipe(res);
};

// GET /api/files  — the Drive listing: every file, newest first, filterable
const listFiles = async (req, res) => {
    const { kind, search = '', from, to, transactionId, topic } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = parseInt(req.query.offset, 10) || 0;

    const params = [req.userId];
    const where = ['a.user_id = $1'];
    const bind = (v) => { params.push(v); return `$${params.length}`; };

    if (kind)          where.push(`a.kind = ${bind(kind)}::attachment_kind`);
    if (transactionId) where.push(`a.transaction_id = ${bind(transactionId)}`);
    if (topic)         where.push(`a.topic = ${bind(topic)}`);
    if (from)          where.push(`a.created_at >= ${bind(from)}`);
    if (to)            where.push(`a.created_at <= ${bind(to)}`);
    if (String(search).trim()) {
        const p = bind(`%${String(search).trim()}%`);
        where.push(`(a.original_name ILIKE ${p} OR t.note ILIKE ${p})`);
    }

    const limitP = bind(limit);
    const offsetP = bind(offset);

    const result = await query(
        `SELECT a.*,
                t.id AS tx_id, t.type AS tx_type, t.amount AS tx_amount,
                t.note AS tx_note, t.occurred_at AS tx_occurred_at,
                c.name AS tx_category_name
           FROM attachments a
           LEFT JOIN transactions t ON t.id = a.transaction_id
           LEFT JOIN categories   c ON c.id = t.category_id
          WHERE ${where.join(' AND ')}
          ORDER BY a.created_at DESC
          LIMIT ${limitP} OFFSET ${offsetP}`,
        params
    );

    const totals = await query(
        `SELECT kind, COUNT(*)::int AS count, COALESCE(SUM(size_bytes), 0)::bigint AS bytes
           FROM attachments WHERE user_id = $1 GROUP BY kind`,
        [req.userId]
    );

    return ok(res, {
        files: result.rows.map(shape),
        hasMore: result.rows.length === limit,
        stats: {
            byKind: Object.fromEntries(
                totals.rows.map((r) => [r.kind, { count: r.count, bytes: Number(r.bytes) }])
            ),
            totalCount: totals.rows.reduce((sum, r) => sum + r.count, 0),
            totalBytes: totals.rows.reduce((sum, r) => sum + Number(r.bytes), 0),
        },
    });
};

// DELETE /api/files/:id
const deleteFile = async (req, res) => {
    const result = await query(
        `DELETE FROM attachments WHERE id = $1 AND user_id = $2 RETURNING stored_path`,
        [req.params.id, req.userId]
    );
    if (!result.rows.length) return fail(res, 404, 'NOT_FOUND', 'File not found');

    const absolute = path.resolve(UPLOAD_ROOT, result.rows[0].stored_path);
    if (absolute.startsWith(UPLOAD_ROOT + path.sep)) {
        fs.unlink(absolute, () => {});
    }

    return ok(res, { deleted: true }, 'File deleted');
};

module.exports = { uploadFiles, getFile, listFiles, deleteFile };
