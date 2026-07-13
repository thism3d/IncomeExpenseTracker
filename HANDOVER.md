# SISIRBINDU TRACKERAPP — handover

Income & expense tracker for Bangladeshi lawyers: income-tax-ready PDF/Excel
statements, with the supporting documents (PDF, DOCX, audio, images) attached to
each entry.

```
backend/      Node 24 · Express 5 · raw pg · WebSocket      → :5051
web/          Vite · React 19 · TS · Tailwind · shadcn      → :5050   (portal + /admin)
flutter_app/  Flutter 3.41 (Android; iOS/macOS/Windows scaffolded for later)
```

## Running it

Three processes, in order — the web app is useless without the backend, and the
backend is useless without Postgres.

```bash
brew services start postgresql@18          # must be accepting connections on :5432

cd backend     && npm install && NODE_ENV=development node src/server.js &
cd web         && npm install && npm run dev &
cd flutter_app && flutter run              # needs an emulator or a device
```

The schema **self-migrates on every backend boot** (`backend/src/utils/initDb.js` is
idempotent `CREATE TABLE IF NOT EXISTS`). There is no migration command to run.

`/run-sisirbindu` is a Claude Code skill that launches and drives all of this —
see `.claude/skills/run-sisirbindu/`.

## Accounts

| Who | Identifier | Password | Notes |
|---|---|---|---|
| Showcase user | `01811567119` | `Sisir@2026` | Jahid Tutul · 724 transactions across 12 months · app PIN `1947` |
| Admin | `muzahid@onzep.uk` | `@ThisM3D2025456` | `/admin` on the web |

Reseed the showcase data any time — it wipes and rebuilds only that user's tracker
data, leaving the account row itself alone:

```bash
NODE_ENV=development node backend/scripts/seed-showcase.js 01811567119
```

## Verifying

```bash
python3 backend/scripts/verify-http.py     # 65 checks: auth, OTP, ledger, reports, admin
node    backend/scripts/verify-ws.js       # 20 checks: the same routes over the socket
cd web         && npx tsc --noEmit && npm run build
cd flutter_app && flutter analyze && flutter build apk --debug
```

All of the above currently pass: 65/65, 20/20, zero TypeScript errors, zero Dart
analyzer issues, APK builds.

## The one architectural idea

**One transport, one implementation.** `http.createServer(app)` and
`new WebSocket.Server({ server })` share a port. A WS frame
(`{id, action, method, payload, token}`) is turned into a synthetic Express request
and pushed through the *same router* the HTTP API uses — so every route works over
both, written once. That is what gives the phone and the web portal live sync: a
transaction saved on one appears on the other without a refresh.

Binary bodies can't ride that (file upload, report download); those go over real
HTTP against the same server with the same bearer token.

## Decisions worth knowing

- **Postgres, not MAMP's MySQL.** MAMP ships MySQL 5.7, which lacks the window
  functions and JSONB the reporting layer leans on. Postgres 18 runs locally.
- **Money is `NUMERIC`, never float**, and every aggregate is computed in SQL
  (`date_trunc` + window functions), not in Dart or JS.
- **Transfers are excluded from income/expense totals everywhere.** Money moving
  between a user's own accounts is neither income nor spending; counting it would
  inflate every report and every tax statement.
- **Chart colour is computed, not chosen.** Income vs expense is a *polarity* pair
  (diverging); categories are 8 *categorical* slots in a CVD-validated fixed order,
  with a 9th folding into "Other" rather than reusing a hue; budget state wears
  *status* tokens always paired with an icon and a label — so meaning never rests
  on colour alone. Validated in both modes: worst adjacent CVD ΔE 37.7 (light) and
  27.5 (dark), against a ≥12 target. Tokens live in `web/src/lib/viz.ts` and
  `flutter_app/lib/theme/app_theme.dart` — keep the two in sync.
- **The app lock cannot be skipped**, per the spec. After first login the user must
  set a PIN; a device biometric is offered on top when the hardware has an
  enrolment. The PIN is required *even with* biometrics enabled, because biometrics
  fail (no enrolment, wet thumb, failed face scan) and it is the only factor the
  server can actually verify — a fingerprint never leaves the device.
- **`constants.dart` is the source of truth for the app version.**
  `android/app/build.gradle.kts` parses `appVersion`/`appBuildNumber` straight out
  of it, because the admin panel's auto-update check compares the published
  `versionCode` against that number. If the two drift, the phone either never sees
  an update or loops on one it already installed.

## ⚠️ Before this reaches real users

**`SHOW_USER_PASSWORDS=true` stores every user's password in plain text** (the
`users.password_plain` column) so the admin panel can display it. You asked for
this explicitly, but it means a database leak is a total credential leak, and the
passwords are visible to anyone who reaches `/admin`. Set it to `false` in
`backend/.env` and drop the column before launch.

Also outstanding for production:

- `backend/.env` contains live SMTP and BulkSMSBD credentials. Rotate them if this
  repo is ever pushed anywhere public. (`.gitignore` excludes `.env`, but the
  secrets are on disk.)
- The Android **release** build is signed with debug keys
  (`android/app/build.gradle.kts`). Generate a real upload keystore before
  publishing.
- `flutter_app/lib/utils/constants.dart` has `useLocalBackend = true`. Flip it, and
  set `_prodBaseUrl`, for a production build.
- The SMS gateway is live — registration OTPs really are sent. The dev fallback that
  echoes the code in the API response only fires when delivery *fails*.

## Known workaround

`flutter_app/pubspec.yaml` pins `record_linux: 1.3.1` and
`record_platform_interface: 1.5.0` under `dependency_overrides`. Without it,
`record`'s own resolution picks a `record_linux` that no longer implements its
platform interface — and because Dart type-checks *every* plugin in the tree, Linux
ones included, that is a hard compile error even for an Android-only build.
