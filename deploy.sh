#!/usr/bin/env bash
#
# SisirBindu — one-command deploy from your Mac to the live server.
#
#   ./deploy.sh                 Deploy backend + admin frontend (code, build, restart).
#                               Schema changes apply automatically via initDb (safe).
#   ./deploy.sh --backend       Deploy backend only.
#   ./deploy.sh --frontend      Deploy admin frontend only.
#   ./deploy.sh --db-push       ALSO overwrite the LIVE database with your LOCAL data.
#                               DESTRUCTIVE: backs up live first, then asks you to type "yes".
#   ./deploy.sh --restart-only  Just restart the pm2 processes (no code changes).
#   ./deploy.sh --help
#
# You type the SSH password ONCE — the script keeps a single multiplexed SSH
# connection open for the whole run.
#
set -euo pipefail

# ---- Domain Config (Change to 'sisirbindu.com' when moving domains) -------
DOMAIN="sisirbindu.site"

# ---- Config ---------------------------------------------------------------
SERVER="root@65.20.79.162"
BACKEND_REMOTE="/home/sisirbindu/web/api.${DOMAIN}/private/nodeapp"
FRONTEND_REMOTE="/home/sisirbindu/web/${DOMAIN}/private/nodeapp"
REMOTE_BACKUP="$BACKEND_REMOTE/backup"

LOCAL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_BACKEND="$LOCAL_ROOT/backend"
LOCAL_FRONTEND="$LOCAL_ROOT/web"
LOCAL_BACKUP="$LOCAL_BACKEND/backup"

PM2_BACKEND="tracker-backend"
PM2_FRONTEND="tracker-frontend"

DB_NAME="sisirbindu"
LOCAL_DB_USER="onzepuser"

HEALTH_URL="https://api.${DOMAIN}/api/health"
CONFIG_URL="https://api.${DOMAIN}/api/app/config"

# ---- Pretty output --------------------------------------------------------
BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; BLU=$'\033[34m'; RST=$'\033[0m'
step() { echo "${BLU}${BOLD}▶ $*${RST}"; }
ok()   { echo "${GRN}✓ $*${RST}"; }
warn() { echo "${YLW}! $*${RST}"; }
die()  { echo "${RED}✗ $*${RST}" >&2; exit 1; }

# ---- Args -----------------------------------------------------------------
DO_BACKEND=0; DO_FRONTEND=0; DO_DBPUSH=0; RESTART_ONLY=0
if [[ $# -eq 0 ]]; then DO_BACKEND=1; DO_FRONTEND=1; fi
while [[ $# -gt 0 ]]; do
  case "$1" in
    -b|--backend)      DO_BACKEND=1 ;;
    -f|--frontend)     DO_FRONTEND=1 ;;
    --db-push)         DO_DBPUSH=1; DO_BACKEND=1 ;;
    --restart-only)    RESTART_ONLY=1; DO_BACKEND=1; DO_FRONTEND=1 ;;
    -h|--help)
      awk 'NR>1 && /^#/{sub(/^# ?/,""); print; next} NR>1{exit}' "$0"; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
  shift
done
# If only --db-push was given, still deploy backend code alongside it.

# ---- SSH multiplexing (password entered once) -----------------------------
CTRL="$HOME/.ssh/cm-sisirbindu.sock"
SSH_OPTS=(-o ControlMaster=auto -o "ControlPath=$CTRL" -o ControlPersist=20m -o ConnectTimeout=15)
RSH="ssh ${SSH_OPTS[*]}"
R() { ssh "${SSH_OPTS[@]}" "$SERVER" "$@"; }

cleanup() { ssh -O exit -o "ControlPath=$CTRL" "$SERVER" 2>/dev/null || true; }
trap cleanup EXIT

TS="$(date +%Y%m%d_%H%M%S)"

echo "${BOLD}SisirBindu deploy → $SERVER${RST}"
echo "${DIM}backend=$DO_BACKEND frontend=$DO_FRONTEND db-push=$DO_DBPUSH restart-only=$RESTART_ONLY${RST}"

step "Connecting (you'll be asked for the SSH password once)…"
R "echo connected to \$(hostname) as \$(whoami)" || die "SSH connection failed"
ok "SSH connection established (reused for the whole run)"

# ---- Restart-only fast path ----------------------------------------------
if [[ $RESTART_ONLY -eq 1 ]]; then
  step "Restarting pm2 processes…"
  R "pm2 restart $PM2_BACKEND $PM2_FRONTEND --update-env"
  ok "Restarted"
  step "Health check…"
  sleep 2
  curl -fsS "$HEALTH_URL" && echo && ok "Backend healthy" || warn "Health check did not return OK"
  exit 0
fi

# ---- Rsync excludes (protect live secrets, data & uploads) ----------------
COMMON_EXCLUDES=(
  --exclude '.git' --exclude 'node_modules' --exclude '.DS_Store'
  --exclude '.env' --exclude '.env.*' --exclude '*.log'
  --exclude 'dist' --exclude 'build'
)
BACKEND_EXCLUDES=(
  "${COMMON_EXCLUDES[@]}"
  --exclude 'backup'            # never wipe live DB backups
  --exclude 'public/downloads'  # never wipe APKs uploaded on the live server
)

# ---- DB push (DESTRUCTIVE, opt-in) ---------------------------------------
if [[ $DO_DBPUSH -eq 1 ]]; then
  warn "DB PUSH will OVERWRITE the live '$DB_NAME' database with your LOCAL data."
  warn "All users/transactions created on live since your last local sync will be LOST."
  read -r -p "${BOLD}Type 'yes' to continue: ${RST}" ans
  [[ "$ans" == "yes" ]] || die "Aborted DB push."

  mkdir -p "$LOCAL_BACKUP"
  local_dump="$LOCAL_BACKUP/sisirbindu_local_$TS.dump"
  step "Dumping LOCAL database → $(basename "$local_dump")"
  pg_dump -U "$LOCAL_DB_USER" -d "$DB_NAME" -F c -f "$local_dump" \
    || die "Local pg_dump failed (set PGPASSWORD if it needs a password)"
  ok "Local dump created ($(du -h "$local_dump" | cut -f1))"

  step "Stopping backend before restore…"
  R "pm2 stop $PM2_BACKEND || true"

  step "Uploading dump + backing up LIVE database first (safety)…"
  R "mkdir -p '$REMOTE_BACKUP'"
  rsync -az -e "$RSH" "$local_dump" "$SERVER:$REMOTE_BACKUP/"
  remote_dump="$REMOTE_BACKUP/$(basename "$local_dump")"
  R "chmod 644 '$remote_dump'"
  R "sudo -u postgres pg_dump -d $DB_NAME -F c -f '$REMOTE_BACKUP/sisirbindu_LIVE_pre_restore_$TS.dump'" \
    && ok "Live DB backed up → sisirbindu_LIVE_pre_restore_$TS.dump" \
    || warn "Live pre-restore backup failed — continuing is risky"

  step "Restoring local dump onto live (--clean --if-exists)…"
  R "sudo -u postgres pg_restore -d $DB_NAME --clean --if-exists -F c '$remote_dump'" \
    || warn "pg_restore reported errors (often harmless 'does not exist' notices)"

  step "Verifying tables…"
  R "sudo -u postgres psql -d $DB_NAME -c \"SELECT count(*) AS tables FROM pg_tables WHERE schemaname='public';\""
  ok "Database push complete"
fi

# ---- Backend deploy -------------------------------------------------------
if [[ $DO_BACKEND -eq 1 ]]; then
  [[ -d "$LOCAL_BACKEND" ]] || die "Local backend not found: $LOCAL_BACKEND"
  step "Syncing backend code → $BACKEND_REMOTE"
  R "mkdir -p '$BACKEND_REMOTE'"
  rsync -az --stats -e "$RSH" "${BACKEND_EXCLUDES[@]}" \
    "$LOCAL_BACKEND/" "$SERVER:$BACKEND_REMOTE/"
  ok "Backend code synced"

  if ! R "[ -f '$BACKEND_REMOTE/.env' ]"; then
    step "Remote .env not found. Uploading local backend/.env as template…"
    rsync -az -e "$RSH" "$LOCAL_BACKEND/.env" "$SERVER:$BACKEND_REMOTE/.env"
    warn "Uploaded default .env. Remember to change production secrets on the server!"
  fi

  step "npm install + build (esbuild bundle) on server…"
  R "cd '$BACKEND_REMOTE' && npm install --no-audit --no-fund && npm run build" \
    || die "Backend install/build failed"
  ok "Backend built"

  step "Restarting $PM2_BACKEND (initDb applies any schema migrations)…"
  R "pm2 delete $PM2_BACKEND || true"
  R "cd '$BACKEND_REMOTE' && pm2 start ecosystem.config.cjs"
  ok "Backend restarted"
fi

# ---- Frontend (admin) deploy ---------------------------------------------
if [[ $DO_FRONTEND -eq 1 ]]; then
  [[ -d "$LOCAL_FRONTEND" ]] || die "Local frontend not found: $LOCAL_FRONTEND"
  step "Syncing admin frontend code → $FRONTEND_REMOTE"
  R "mkdir -p '$FRONTEND_REMOTE'"
  rsync -az --stats -e "$RSH" "${COMMON_EXCLUDES[@]}" \
    "$LOCAL_FRONTEND/" "$SERVER:$FRONTEND_REMOTE/"
  ok "Frontend code synced"

  if [[ -f "$LOCAL_FRONTEND/.env.production" ]]; then
    step "Uploading frontend production env (.env.production)…"
    rsync -az -e "$RSH" "$LOCAL_FRONTEND/.env.production" "$SERVER:$FRONTEND_REMOTE/.env.production"
  fi

  step "npm install + build (tsc + vite) on server…"
  R "cd '$FRONTEND_REMOTE' && npm install --no-audit --no-fund && npm run build" \
    || die "Frontend install/build failed"
  ok "Frontend built"
  step "Restarting ${PM2_FRONTEND} & setting up Hestia symlink…"
  FRONTEND_PUBLIC="/home/sisirbindu/web/${DOMAIN}/public_html"
  R "rm -rf '$FRONTEND_PUBLIC' && ln -s '$FRONTEND_REMOTE/dist' '$FRONTEND_PUBLIC' && chown -h sisirbindu:www-data '$FRONTEND_PUBLIC'"
  R "pm2 delete $PM2_FRONTEND || true"
  R "cd '$FRONTEND_REMOTE' && pm2 start ecosystem.config.cjs"
  ok "Frontend restarted under PM2"
fi

# ---- Health check ---------------------------------------------------------
step "Health check…"
sleep 2
if curl -fsS "$HEALTH_URL" >/dev/null; then
  ok "Backend healthy: $HEALTH_URL"
  echo "${DIM}Live app config:${RST}"
  curl -fsS "$CONFIG_URL" | python3 -m json.tool 2>/dev/null || true
else
  warn "Health check failed — check: pm2 logs $PM2_BACKEND"
fi

ok "${BOLD}Deploy finished.${RST}"
