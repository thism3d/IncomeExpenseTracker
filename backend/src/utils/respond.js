const ok = (res, data, message) =>
    res.json({ success: true, ...(message ? { message } : {}), data });

const created = (res, data, message) =>
    res.status(201).json({ success: true, ...(message ? { message } : {}), data });

const fail = (res, status, code, message, extra = {}) =>
    res.status(status).json({ success: false, error: { code, message, ...extra } });

// Wrap an async controller so a rejected promise reaches the error handler
// instead of hanging the request. Express 5 forwards rejections itself, but the
// WebSocket dispatcher calls app.handle() directly and needs this.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ok, created, fail, wrap };
