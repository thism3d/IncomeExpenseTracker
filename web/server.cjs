/**
 * Zero-dependency static server for the built SPA (./dist).
 *
 * Serves the Vite build and falls back to index.html for any path that isn't a
 * real file — that is what makes a hard refresh at /reports or /admin/users work
 * instead of 404ing.
 *
 *   PORT=5050 node server.cjs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5050;
const DIST = path.join(__dirname, 'dist');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
};

const send = (res, status, body, headers = {}) => {
    res.writeHead(status, headers);
    res.end(body);
};

const server = http.createServer((req, res) => {
    // Strip the query string and normalise, then confine to DIST. Without the
    // startsWith check, `GET /../../etc/passwd` would escape the web root.
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const filePath = path.normalize(path.join(DIST, urlPath));

    if (!filePath.startsWith(DIST)) {
        return send(res, 403, 'Forbidden');
    }

    fs.readFile(filePath, (err, data) => {
        if (!err) {
            const ext = path.extname(filePath).toLowerCase();

            // Hashed assets are immutable; index.html must never be cached or users
            // keep booting an old bundle after a deploy.
            const cache = urlPath.startsWith('/assets/')
                ? 'public, max-age=31536000, immutable'
                : 'no-cache';

            return send(res, 200, data, {
                'Content-Type': MIME[ext] || 'application/octet-stream',
                'Cache-Control': cache,
                // The service worker must be allowed to control the whole origin.
                ...(urlPath === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}),
            });
        }

        // Not a real file: it's a client-side route. Hand back the shell and let
        // react-router sort it out.
        fs.readFile(path.join(DIST, 'index.html'), (shellErr, shell) => {
            if (shellErr) {
                return send(res, 500, 'Build missing. Run `npm run build` first.');
            }
            return send(res, 200, shell, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache',
            });
        });
    });
});

server.listen(PORT, () => {
    console.log(`SISIRBINDU web  →  http://localhost:${PORT}`);
});
