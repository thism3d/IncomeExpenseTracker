# SisirBindu TrackerApp

An advanced, responsive, real-time Income & Expense Tracker designed specifically for lawyers in Bangladesh. It features automatic income-tax-ready PDF and Excel statement generation, calendar-based ledger browsing, secure document storage (the "Drive"), push/email notifications, and real-time live synchronization between the mobile app, web portal, and admin panel.

---

## Technical Architecture

```
                                  ┌───────────────┐
                                  │  Flutter App  │
                                  └──────┬────────┘
                                         │ WebSocket / HTTP
                                         ▼
┌─────────────┐  HTTP (Vite static)  ┌───────────────────┐  Raw SQL  ┌──────────────┐
│ Web Portal  ├─────────────────────►│  Express Backend  ├──────────►│  PostgreSQL  │
└─────────────┘                      └───────────────────┘           └──────────────┘
```

- **Shared Transport Architecture**: HTTP and WebSockets share a single port (5051). Incoming WS frames are mapped to synthetic Express requests and dispatched through the exact same router as the HTTP API. This ensures a single source of truth for security, validation, and handler logic.
- **Real-time Live Sync**: Saving a transaction on a mobile device immediately broadcasts a WebSocket event to live web sessions, syncing client state in real time without refreshing.
- **Reporting**: Aggregate reports, categorised totals, and tax statements are calculated directly inside SQL queries (`date_trunc` + window functions) for performance.

---

## Tech Stack

*   **Backend**: Node.js 24 + Express 5 + raw `pg` (PostgreSQL client) + `ws` (WebSockets)
*   **Web Portal**: React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui
*   **Mobile Application**: Flutter 3.41 (supporting Android, scaffolded for iOS/Desktop)
*   **Database**: PostgreSQL 18+ (utilises enums, UUIDs, window functions, and JSONB columns)

---

## Local Development Startup

### Prerequisites
1. Install **PostgreSQL 18** (or a version supporting window functions/JSONB):
   ```bash
   brew services start postgresql@18
   ```
   Ensure it is running on the default port `5432` with a database matching your local config.

2. Ensure you are using **Node.js 24**:
   ```bash
   nvm use
   ```

### 1. Run the Backend Server
```bash
cd backend
npm install
# Boot server (automatically runs idempotent database migrations on startup)
NODE_ENV=development node src/server.js
```
The API is available at `http://localhost:5051` and WebSockets on `ws://localhost:5051/ws`.

### 2. Run the Web Portal
```bash
cd web
npm install
npm run dev
```
The web portal will boot at `http://localhost:5050`.

### 3. Run the Flutter Mobile App
Ensure you have an active emulator or connected device:
```bash
cd flutter_app
flutter pub get
flutter run
```

---

## Seed Showcase Accounts

To seed a showcase lawyer account containing 12 months of mock data (724 transactions, budgets, payment methods, attachments) for testing:

```bash
NODE_ENV=development node backend/scripts/seed-showcase.js 01811567119
```

| Account Type | Identifier / Phone | Password | App PIN | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Showcase User** | `01811567119` | `Sisir@2026` | `1947` | Bangladeshi formatting |
| **Admin Panel** | `muzahid@onzep.uk` | `@ThisM3D2025456` | — | Access `/admin` on the web |

---

## Verifying & Testing

Before committing or deploying, ensure the entire test suite passes:

1. **HTTP Integration Tests** (65 test checkpoints verifying authentication, OTP, ledger routing, budgets, exports):
   ```bash
   python3 backend/scripts/verify-http.py
   ```
2. **WebSocket Integration Tests** (20 socket action verifications):
   ```bash
   node backend/scripts/verify-ws.js
   ```
3. **Web TypeScript & Production compilation**:
   ```bash
   cd web && npx tsc --noEmit && npm run build
   ```
4. **Flutter Static Analysis & Build compilation**:
   ```bash
   cd flutter_app && flutter analyze && flutter build apk --debug
   ```

---

## Production Deployment

### 1. Database Provisioning
Run the database installation and configurations on the live Linux server as root:
```bash
sudo bash deploy/provision-db.sh
```

### 2. Sync and Deploy
To build, transfer, and restart all PM2 processes (backend server + static web server):
```bash
./deploy.sh
```

### 3. Changing the Target Domain
To shift domains (e.g. from `sisirbindu.site` to `sisirbindu.com`):
*   **Web Production Config**: Edit `VITE_API_URL` in `web/.env.production`
*   **Backend config**: Edit `FRONTEND_URL` in `backend/.env`
*   **Mobile Config**: Edit `_prodHost` inside `flutter_app/lib/utils/constants.dart`
*   **Deploy script**: Edit `DOMAIN` at the top of `deploy.sh`
*   Re-deploy using `./deploy.sh`.
