const path = require('path');
const envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
require('dotenv').config({ path: path.resolve(__dirname, '..', envFile) });

const http = require('http');
const url = require('url');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');

const { initDatabase } = require('./utils/initDb');
const { startCronJobs } = require('./services/cronService');
const { initPush } = require('./services/notify');
const { maintenanceGuard } = require('./middleware/maintenance');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 5051;
const server = http.createServer(app);

// ---------------------------------------------------------------- WebSocket
//
// One transport, one implementation: a WS message is turned into a synthetic
// Express request and pushed through the very same router the HTTP API uses.
// Clients get free server-push, and no route has to be written twice.

const wss = new WebSocket.Server({ server, path: '/ws' });

// userId -> Set<WebSocket>. A user can be on their phone and the web at once.
const activeSockets = new Map();

const registerSocket = (userId, ws) => {
    if (!userId) return;
    if (!activeSockets.has(userId)) activeSockets.set(userId, new Set());
    activeSockets.get(userId).add(ws);
    ws.userId = userId;
};

const unregisterSocket = (ws) => {
    if (!ws.userId) return;
    const sockets = activeSockets.get(ws.userId);
    if (!sockets) return;
    sockets.delete(ws);
    if (sockets.size === 0) activeSockets.delete(ws.userId);
};

const pushToUser = (userId, event, payload) => {
    const sockets = activeSockets.get(userId);
    if (!sockets) return;
    const frame = JSON.stringify({ type: 'event', event, payload });
    for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) ws.send(frame);
    }
};

const broadcastAll = (event, payload) => {
    const frame = JSON.stringify({ type: 'event', event, payload });
    for (const sockets of activeSockets.values()) {
        for (const ws of sockets) {
            if (ws.readyState === WebSocket.OPEN) ws.send(frame);
        }
    }
};

global.pushToUser = pushToUser;
global.broadcastAll = broadcastAll;
global.activeSockets = activeSockets;

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (raw) => {
        let message;
        try {
            message = JSON.parse(raw);
        } catch (_) {
            return ws.send(JSON.stringify({
                status: 400,
                payload: { success: false, error: { code: 'BAD_FRAME', message: 'Malformed JSON' } },
            }));
        }

        const { id, action, method = 'POST', payload = {}, token } = message;

        if (!action) {
            return ws.send(JSON.stringify({
                id,
                status: 400,
                payload: { success: false, error: { code: 'BAD_REQUEST', message: 'Missing action' } },
            }));
        }

        // Bind this socket to a user so pushes can find it. Authorization itself
        // still happens in the normal `authenticate` middleware below — this only
        // decides where server-pushed events get delivered.
        if (token) {
            try {
                const decoded = jwt.verify(token.replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET);
                if (decoded?.userId) registerSocket(decoded.userId, ws);
            } catch (_) { /* an invalid token just means no pushes; the request will 401 on its own */ }
        }

        // 'auth/login' -> '/api/auth/login';  'transactions?limit=10' keeps its query.
        const parsed = url.parse(action.startsWith('/api') ? action : `/api/${action}`, true);
        const requestPath = parsed.pathname.replace(/\/{2,}/g, '/');

        const req = {
            url: parsed.path,
            originalUrl: parsed.path,
            path: requestPath,
            method: String(method).toUpperCase(),
            headers: {
                'content-type': 'application/json',
                'x-websocket-request': 'true',
                ...(token
                    ? { authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` }
                    : {}),
            },
            body: payload,
            query: parsed.query,
            params: {},
            ip: ws._socket?.remoteAddress,
            isWebSocket: true,
        };

        const reply = (status, body) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            ws.send(JSON.stringify({ id, action, status, payload: body }));
        };

        // The minimum of the Express response surface our handlers touch.
        const res = {
            statusCode: 200,
            headersSent: false,
            locals: {},
            status(code) { this.statusCode = code; return this; },
            set() { return this; },
            setHeader() { return this; },
            getHeader() { return undefined; },
            removeHeader() { return this; },
            json(body) { this.headersSent = true; reply(this.statusCode, body); return this; },
            send(body) {
                this.headersSent = true;
                let parsedBody = body;
                if (typeof body === 'string') {
                    try { parsedBody = JSON.parse(body); } catch (_) { /* keep the string */ }
                }
                reply(this.statusCode, parsedBody);
                return this;
            },
            end() {
                if (!this.headersSent) reply(this.statusCode, null);
                this.headersSent = true;
                return this;
            },
        };

        try {
            app.handle(req, res);
        } catch (err) {
            console.error('WS dispatch error:', err);
            reply(500, { success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
        }
    });

    ws.on('close', () => unregisterSocket(ws));
    ws.on('error', () => unregisterSocket(ws));
});

// Drop sockets that stopped answering, so activeSockets doesn't leak entries for
// phones that went out of coverage without a clean close.
const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
        if (ws.isAlive === false) {
            unregisterSocket(ws);
            ws.terminate();
            continue;
        }
        ws.isAlive = false;
        ws.ping();
    }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

// -------------------------------------------------------------------- HTTP

app.set('trust proxy', 1);
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// A WS-dispatched request already has an object body — running it through the
// JSON parser would hang waiting for a stream that never arrives.
const skipForWebSocket = (parser) => (req, res, next) => {
    if (req.headers['x-websocket-request'] === 'true') return next();
    return parser(req, res, next);
};
app.use(skipForWebSocket(express.json({ limit: '2mb' })));
app.use(skipForWebSocket(express.urlencoded({ extended: true, limit: '2mb' })));

// APK downloads for the in-app updater. Resolved from __dirname at module load
// because esbuild collapses it into dist/ at build time.
const DOWNLOADS_DIR = path.join(__dirname, '..', 'public', 'downloads');
global.APK_DOWNLOADS_DIR = DOWNLOADS_DIR;
app.use('/downloads', express.static(DOWNLOADS_DIR, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.apk')) {
            res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        }
    },
}));

app.get('/api/health', (req, res) =>
    res.json({ success: true, data: { status: 'ok', uptime: process.uptime(), now: new Date().toISOString() } })
);

app.use(maintenanceGuard);
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

app.use((req, res) =>
    res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
    })
);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    // Multer surfaces upload problems here.
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            success: false,
            error: { code: 'FILE_TOO_LARGE', message: `File exceeds the ${process.env.MAX_UPLOAD_MB || 50}MB limit` },
        });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(413).json({
            success: false,
            error: { code: 'TOO_MANY_FILES', message: 'Too many files in one upload' },
        });
    }
    if (err.message?.startsWith('Unsupported file type') || err.message?.startsWith('Only .apk')) {
        return res.status(415).json({
            success: false,
            error: { code: 'UNSUPPORTED_TYPE', message: err.message },
        });
    }

    console.error('Unhandled error:', err);
    return res.status(500).json({
        success: false,
        error: {
            code: 'SERVER_ERROR',
            message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
        },
    });
});

// -------------------------------------------------------------------- boot

const start = async () => {
    try {
        await initDatabase();
        initPush();          // web push, if VAPID keys are configured
        startCronJobs();
        server.listen(PORT, () => {
            console.log('');
            console.log('  SISIRBINDU TRACKERAPP — backend');
            console.log(`  HTTP  http://localhost:${PORT}/api`);
            console.log(`  WS    ws://localhost:${PORT}/ws`);
            console.log(`  Env   ${process.env.NODE_ENV || 'production'}`);
            console.log('');
        });
    } catch (err) {
        console.error('Startup failed:', err);
        process.exit(1);
    }
};

start();

module.exports = { app, server };
