#!/usr/bin/env bash
#
# SisirBindu — database provisioning script for Ubuntu/Debian.
# Run on the live server as root/sudo to install and configure PostgreSQL:
#
#   sudo bash provision-db.sh
#
set -euo pipefail

# ---- Color Output ---------------------------------------------------------
BOLD=$'\033[1m'; RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; BLU=$'\033[34m'; RST=$'\033[0m'
info() { echo "${BLU}${BOLD}▶ $*${RST}"; }
ok()   { echo "${GRN}✓ $*${RST}"; }
warn() { echo "${YLW}! $*${RST}"; }
die()  { echo "${RED}✗ $*${RST}" >&2; exit 1; }

# Ensure running as root
if [ "$EUID" -ne 0 ]; then
  die "This script must be run as root or with sudo."
fi

# Fallback defaults (if not parsed from .env)
DB_NAME="sisirbindu"
DB_USER="sisirbindu"
DB_PASS="CHANGE_ME_STRONG_PASSWORD"

# Try to parse from local .env if this script is executed in the project context
ENV_FILE="../backend/.env"
if [ -f "$ENV_FILE" ]; then
  info "Found backend/.env, parsing database credentials..."
  # Parse postgresql://user:pass@host:port/dbname
  DB_URL=$(grep -E "^DATABASE_URL=" "$ENV_FILE" | cut -d'=' -f2- || true)
  if [ -n "$DB_URL" ]; then
    # Strip postgresql://
    STRIPPED=${DB_URL#postgresql://}
    # Parse credentials and host/dbname
    CRED_PART=${STRIPPED%%@*}
    HOST_DB_PART=${STRIPPED#*@}
    
    DB_USER=${CRED_PART%%:*}
    DB_PASS=${CRED_PART#*:}
    
    DB_DB_PART=${HOST_DB_PART#*/}
    # Strip any connection parameters (e.g. ?sslmode=disable)
    DB_NAME=${DB_DB_PART%%\?*}
    
    info "Parsed from .env: User='$DB_USER', Database='$DB_NAME'"
  fi
fi

# ---- Configure Database & User (Access using sudo -u postgres) -------------
info "Configuring PostgreSQL user and database..."

# Check if role already exists
ROLE_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'")

if [ "$ROLE_EXISTS" = "1" ]; then
  info "Role '$DB_USER' already exists. Updating password..."
  sudo -u postgres psql -c "ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASS';"
else
  info "Creating role '$DB_USER'..."
  sudo -u postgres psql -c "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';"
fi

# Check if database already exists
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")

if [ "$DB_EXISTS" = "1" ]; then
  info "Database '$DB_NAME' already exists."
else
  info "Creating database '$DB_NAME' owned by '$DB_USER'..."
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
fi

# Grant privileges
info "Granting privileges..."
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
# For modern Postgres version 15+, we also grant schema permissions
sudo -u postgres psql -d $DB_NAME -c "GRANT ALL ON SCHEMA public TO $DB_USER;"

# ---- 4. Configure local md5/scram auth if needed ----------------------------
# In modern PostgreSQL, default configurations on localhost may use peer/ident.
# If peer is used, connection string with username/password will fail unless md5/scram is enabled.
PG_VERSION=$(sudo -u postgres psql -tAc "SHOW server_version;" | cut -d'.' -f1)
HBA_CONF="/etc/postgresql/$PG_VERSION/main/pg_hba.conf"

if [ -f "$HBA_CONF" ]; then
  info "Verifying connection authentication methods in $HBA_CONF..."
  # If local connections are set to peer, append or adjust them to md5/scram
  # Check if we have md5/scram configured for local/host connections
  if ! grep -qE "^local\s+all\s+all\s+(md5|scram-sha-256)" "$HBA_CONF"; then
    warn "Local MD5/SCRAM-SHA-256 authentication not found at top of local records."
    # Back up hba config
    cp "$HBA_CONF" "${HBA_CONF}.bak"
    # Insert host/local rule to allow md5/scram logins for the user
    # Insert rule near the top of active records
    sed -i "s/^local\s\+all\s\+all\s\+peer/local   all             all                                     scram-sha-256/g" "$HBA_CONF"
    sed -i "s/^host\s\+all\s\+all\s\+127.0.0.1\/32\s\+scram-sha-256/host    all             all             127.0.0.1\/32            scram-sha-256/g" "$HBA_CONF"
    
    info "Updated pg_hba.conf to support password authentication for local connections."
    info "Restarting PostgreSQL service..."
    systemctl restart postgresql
  fi
fi

ok "PostgreSQL provisioned successfully."
info "Database: $DB_NAME"
info "User:     $DB_USER"
info "Host:     localhost:5432"
