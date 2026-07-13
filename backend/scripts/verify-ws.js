// Verifies the WebSocket dispatcher: the same routes must work over WS, and
// server-push events must reach the right sockets.
const WebSocket = require('/Users/onzep/Downloads/SisirBindu/SisirBindu TrackerApp/backend/node_modules/ws');
const { execFileSync } = require('node:child_process');

// The API only echoes a `devCode` when SMS/email delivery FAILS (a dev fallback).
// When the real gateway accepts the message the code is correctly withheld, so
// read it from the DB instead of depending on a delivery failure.
const otpFor = (identifier, purpose = 'register') =>
    execFileSync('psql', [
        '-U', 'onzepuser', '-h', 'localhost', '-d', 'sisirbindu', '-t', '-A', '-c',
        `SELECT code FROM otp_codes WHERE identifier='${identifier}' AND purpose='${purpose}' ORDER BY created_at DESC LIMIT 1`,
    ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'Oz76185Una3Er' } }).trim();

const WS_URL = 'ws://localhost:5051/ws';
const pass = [], fail = [];
const check = (name, cond, detail = '') => {
    (cond ? pass : fail).push(name);
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const connect = () => new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.pending = new Map();
    ws.events = [];
    ws.counter = 0;

    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'event') {
            ws.events.push(msg);
            return;
        }
        const p = ws.pending.get(msg.id);
        if (p) { ws.pending.delete(msg.id); p(msg); }
    });
});

const rpc = (ws, action, method = 'POST', payload = {}, token = null) =>
    new Promise((resolve, reject) => {
        const id = `req_${++ws.counter}`;
        ws.pending.set(id, resolve);
        ws.send(JSON.stringify({ id, action, method, payload, ...(token ? { token: `Bearer ${token}` } : {}) }));
        setTimeout(() => {
            if (ws.pending.has(id)) { ws.pending.delete(id); reject(new Error(`timeout: ${action}`)); }
        }, 8000);
    });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    console.log('\n=== WebSocket transport ===');

    const ws = await connect();
    check('socket connects', ws.readyState === WebSocket.OPEN);

    // Public route over WS.
    let r = await rpc(ws, 'app/config', 'GET');
    check('GET app/config over WS', r.status === 200 && r.payload.success);

    // Full auth flow over WS — no HTTP at all.
    const PHONE = '01911223344';
    r = await rpc(ws, 'auth/register/send-otp', 'POST', { identifier: PHONE });
    check('register/send-otp over WS', r.status === 200, r.payload.data?.destination);
    const code = otpFor('8801911223344');

    r = await rpc(ws, 'auth/register/verify-otp', 'POST', { identifier: PHONE, code });
    check('register/verify-otp over WS', r.status === 200);

    r = await rpc(ws, 'auth/register/set-password', 'POST', {
        ticket: r.payload.data.ticket, name: 'WS Lawyer', password: 'Websocket@2026',
    });
    check('register/set-password over WS', r.status === 201);
    const token = r.payload.data.token;

    // Configure the app lock, otherwise subsequent data routes will return 403 LOCK_REQUIRED
    await rpc(ws, 'auth/lock/setup', 'POST', { pin: '1234', biometricEnabled: false }, token);

    r = await rpc(ws, 'auth/login', 'POST', { identifier: PHONE, password: 'Websocket@2026' });
    check('login over WS', r.status === 200 && !!r.payload.data.token);

    // An authenticated GET with a query string in the action.
    r = await rpc(ws, 'categories?type=EXPENSE', 'GET', {}, token);
    check('authenticated GET with query params over WS',
        r.status === 200 && r.payload.data.categories.length === 58,
        `${r.payload.data.categories.length} categories`);

    // Auth is really enforced on the WS path too.
    r = await rpc(ws, 'transactions', 'GET');
    check('unauthenticated WS request is rejected', r.status === 401);

    r = await rpc(ws, 'admin/stats', 'GET', {}, token);
    check('non-admin blocked on the WS path', r.status === 403);

    // Write a transaction over WS and confirm the push event fires.
    r = await rpc(ws, 'accounts', 'GET', {}, token);
    const accountId = r.payload.data.accounts[0].id;
    r = await rpc(ws, 'categories?type=EXPENSE&search=Fuel', 'GET', {}, token);
    const categoryId = r.payload.data.categories[0].id;

    ws.events.length = 0;
    r = await rpc(ws, 'transactions', 'POST', {
        type: 'EXPENSE', accountId, amount: 1200, categoryId, note: 'Fuel to court',
    }, token);
    check('create transaction over WS', r.status === 201);

    await sleep(300);
    const createdEvent = ws.events.find((e) => e.event === 'transaction:created');
    check('server pushed transaction:created', !!createdEvent, createdEvent?.payload?.note);

    // A second socket for the same user must also receive the push (phone + web).
    const ws2 = await connect();
    await rpc(ws2, 'auth/me', 'GET', {}, token);   // binds ws2 to this userId
    await sleep(200);
    ws.events.length = 0;
    ws2.events.length = 0;

    await rpc(ws, 'transactions', 'POST', {
        type: 'EXPENSE', accountId, amount: 300, categoryId, note: 'Second device test',
    }, token);
    await sleep(400);
    check('push fans out to a second session of the same user',
        ws2.events.some((e) => e.event === 'transaction:created'));

    // Admin broadcast must land on the user's socket.
    const adminWs = await connect();
    r = await rpc(adminWs, 'auth/login', 'POST',
        { identifier: 'muzahid@onzep.uk', password: '@ThisM3D2025456' });
    const adminToken = r.payload.data.token;
    check('admin login over WS', r.status === 200 && r.payload.data.user.isAdmin);

    ws.events.length = 0;
    r = await rpc(adminWs, 'admin/broadcast', 'POST', {
        audience: 'all', title: 'WS Broadcast', message: 'Pushed live over the socket.',
    }, adminToken);
    check('broadcast sent', r.status === 200, `${r.payload.data.sent} recipient(s)`);

    await sleep(500);
    const notif = ws.events.find((e) => e.event === 'notification');
    check('user socket received the broadcast push', !!notif, notif?.payload?.title);

    // Maintenance toggle must broadcast to every socket, not just the actor's.
    ws.events.length = 0;
    await rpc(adminWs, 'admin/maintenance', 'PUT', {
        active: true, mode: 'immediate', message: 'WS maintenance test',
    }, adminToken);
    await sleep(400);
    const maint = ws.events.find((e) => e.event === 'maintenance');
    check('maintenance broadcast reaches all sockets', !!maint && maint.payload.active === true);

    r = await rpc(ws, 'transactions', 'GET', {}, token);
    check('WS requests are blocked during maintenance', r.status === 503);

    await rpc(adminWs, 'admin/maintenance', 'PUT', { active: false, mode: 'immediate' }, adminToken);
    await sleep(200);
    r = await rpc(ws, 'transactions', 'GET', {}, token);
    check('WS requests work again after maintenance', r.status === 200);

    // A malformed frame must not kill the connection.
    ws.send('not json at all');
    await sleep(200);
    check('malformed frame does not drop the socket', ws.readyState === WebSocket.OPEN);
    r = await rpc(ws, 'auth/me', 'GET', {}, token);
    check('socket still usable after a bad frame', r.status === 200);

    [ws, ws2, adminWs].forEach((s) => s.close());

    console.log('\n' + '='.repeat(62));
    console.log(`  WebSocket: ${pass.length} passed, ${fail.length} failed`);
    fail.forEach((f) => console.log(`    FAILED: ${f}`));
    console.log('='.repeat(62));
    process.exit(fail.length ? 1 : 0);
})().catch((err) => {
    console.error('\nWS verification crashed:', err.message);
    process.exit(1);
});
