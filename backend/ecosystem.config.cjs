/**
 * PM2 process definition — backend API + WebSocket.
 *
 * `npm run build` bundles src/server.js into dist/boot.js with esbuild, and
 * `npm start` runs that — so PM2 runs the built artefact, not the source.
 *
 * Secrets deliberately live in `.env`, NOT here. The app loads .env through
 * dotenv, and dotenv will not override anything PM2 has already put in the
 * environment — so a value duplicated here would silently win over .env and the
 * two would drift. Only PORT and NODE_ENV are pinned, because PM2 needs them.
 */
module.exports = {
    apps: [
        {
            name: 'tracker-backend',
            script: 'dist/boot.js',
            cwd: __dirname,
            instances: 1,
            // fork, not cluster: the WebSocket dispatcher holds per-user socket
            // state in memory (activeSockets). Under cluster mode a server push
            // would only reach the worker that happens to hold that user's socket.
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production',
                PORT: 5051,
            },
            time: true,
        },
    ],
};
