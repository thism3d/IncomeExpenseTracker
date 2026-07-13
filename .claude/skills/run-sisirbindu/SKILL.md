---
name: run-sisirbindu
description: Build, run, and drive SISIRBINDU TRACKERAPP (Postgres + Node/WebSocket backend + React web portal + admin console). Use when asked to start the app, run the backend or web server, screenshot the UI, test the login/transaction/report flows, verify the PDF or Excel export, or interact with the running app.
---

Income/expense tracker for Bangladeshi lawyers: a Node backend (Express + raw `pg` + a
WebSocket RPC dispatcher) on `:5051`, a Vite/React portal + `/admin` console on `:5050`,
and a Flutter Android client. **Drive the web surface with
`.claude/skills/run-sisirbindu/driver.mjs`** — a Playwright harness that logs in, adds a
real transaction, screenshots every page, and fails on any console error.

All paths below are relative to the repo root (`SisirBindu TrackerApp/`).

Three processes, in this order — **the web app is useless without the backend, and the
backend is useless without Postgres.**

## Prerequisites

Verified on macOS with Homebrew Postgres. Node 24.14.1, PostgreSQL 18.3.

```bash
brew services start postgresql@18     # must be accepting connections on :5432
pg_isready                            # -> /tmp:5432 - accepting connections
```

The DB user and database already exist. To recreate from scratch:

```bash
PGPASSWORD=Oz76185Una3Er psql -U onzepuser -h localhost -d postgres -c "CREATE DATABASE sisirbindu;"
```

The schema **self-migrates on every backend boot** (`backend/src/utils/initDb.js` is
idempotent `CREATE TABLE IF NOT EXISTS`). There is no migration command to run.

## Setup

```bash
cd backend && npm install && cd ..
cd web     && npm install && cd ..
```

Playwright is **not** a project dependency — the driver needs it installed into `web/`,
plus its browser binary (~99 MB, one time):

```bash
cd web
npm install --no-save playwright@1.61.1
npx playwright install chromium
cd ..
```

## Run (agent path)

Start both servers, then drive:

```bash
# macOS has no `timeout` (that's GNU coreutils) — poll with a bounded loop instead.
wait_for() { for _ in $(seq 60); do curl -sf "$1" >/dev/null && return 0; sleep 0.5; done; return 1; }

# 1. backend — :5051 (HTTP + WebSocket + file serving). Reads backend/.env.development.
(cd backend && NODE_ENV=development node src/server.js > /tmp/sb-backend.log 2>&1 &)
wait_for http://localhost:5051/api/health && echo "backend up"

# 2. web — :5050
(cd web && npm run dev > /tmp/sb-web.log 2>&1 &)
wait_for http://localhost:5050 && echo "web up"

# 3. drive it
node .claude/skills/run-sisirbindu/driver.mjs all
```

Screenshots → `/tmp/sisir-shots/`. **Look at them** — a blank frame is a failed launch.

| flow | what it does |
|---|---|
| `smoke` (default) | login → dashboard (light + dark) → **adds a real transaction** and asserts it appears in the ledger → calendar → reports → drive → budgets |
| `admin` | admin login → overview → users → app/maintenance → broadcast |
| `export` | downloads the PDF + Excel statements and asserts the magic bytes (`%PDF`, `PK`) |
| `all` | all three |

The driver **exits non-zero on any console error** — a page can render its shell while
every data fetch fails, so a clean exit is the actual pass signal.

Seeded credentials (from `backend/.env.development`): user `01712345678` / `Lawyer@2026`,
admin `muzahid@onzep.uk` / `@ThisM3D2025456`. Override with `USER_ID`/`USER_PW`/
`ADMIN_ID`/`ADMIN_PW`. If the user doesn't exist yet, register one — the OTP is returned
in the API response as `devCode` when `NODE_ENV=development` (SMS delivery fails locally):

```bash
curl -s -X POST http://localhost:5051/api/auth/register/send-otp \
  -H 'Content-Type: application/json' -d '{"identifier":"01712345678"}'
```

Stop everything:

```bash
pkill -f 'node src/server.js'; pkill -f 'vite'
```

## Direct invocation (no browser)

Every route works over **both** HTTP and the WebSocket — the WS dispatcher forges an
Express request and re-enters the same router. To exercise the API without a browser:

```bash
TOK=$(curl -s -X POST http://localhost:5051/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"01712345678","password":"Lawyer@2026"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")

curl -s http://localhost:5051/api/reports/overview -H "Authorization: Bearer $TOK"
curl -s "http://localhost:5051/api/reports/export?format=pdf&period=monthly" \
  -H "Authorization: Bearer $TOK" -o /tmp/statement.pdf && file /tmp/statement.pdf
```

## Run (human path)

`cd backend && npm run dev` and `cd web && npm run dev`, then open
<http://localhost:5050>. Same thing, just watched by a human.

## Build

```bash
cd web && npx tsc --noEmit && npm run build     # typecheck must be clean; ~6s
```

## Gotchas

- **`networkidle` never settles.** The client holds a WebSocket open for the whole
  session, so Playwright's `waitUntil: 'networkidle'` and `wait-idle` hang forever.
  Always wait on a real element (`waitForSelector`).
- **Dialog selectors must be scoped to `[role=dialog]`.** The transaction modal floats
  over the ledger, and the ledger rows contain the same category names ("Fuel",
  "Groceries"). An unscoped `button:has-text("Fuel")` matches a row *behind* the modal,
  and Playwright reports `<div …overlay…> intercepts pointer events` — which looks like a
  z-index bug but is really a selector bug. The driver scopes to the dialog; do the same.
- **`chromium-cli` is not installed here.** That's why `driver.mjs` exists at all. Don't
  reach for the `chromium-cli` heredoc pattern — it won't resolve.
- **`web/` has no `playwright` in `package.json`.** It's installed `--no-save` on purpose
  (agent tooling, not a product dep), so a fresh `npm ci` wipes it. Re-run the install
  line above if the driver reports it missing.
- **Charts animate in.** Screenshot immediately after navigation and you catch Recharts
  mid-tween. The driver waits ~1.8–2.5s before each shot; keep that.
- **A "download" can be a JSON error body.** The export route streams bytes on success but
  returns JSON on failure, and Playwright saves either one happily. The driver checks the
  magic bytes (`%PDF` / `PK`) — trust that, not the filename.

## Troubleshooting

- **`Executable doesn't exist at …/chrome-headless-shell`** — the Playwright npm package is
  installed but its browser isn't. `cd web && npx playwright install chromium`.
- **`role "postgres" does not exist`** — this project doesn't use the `postgres` superuser.
  Connect as `onzepuser` (see `backend/.env.development` `DATABASE_URL`).
- **Backend exits immediately, log says `connect ECONNREFUSED …:5432`** — Postgres isn't
  running. `brew services start postgresql@18`.
- **`EADDRINUSE :5051` or `:5050`** — a previous run is still up.
  `pkill -f 'node src/server.js'; pkill -f vite`.
- **Driver logs in but then times out on the dashboard** — the backend is up but
  maintenance mode is on, so every user request 503s while the shell still renders. Turn it
  off from `/admin/app`, or:
  ```bash
  PGPASSWORD=Oz76185Una3Er psql -U onzepuser -h localhost -d sisirbindu \
    -c "UPDATE settings SET value='false' WHERE key='maintenance_active';"
  ```
