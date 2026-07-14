#!/usr/bin/env bash
#
# SisirBindu -- one-command GitHub version control.
#
#   ./git.sh                    Stage all changes, commit (asks for message), push to origin/main.
#   ./git.sh "your message"     Skip the prompt and commit with the given message.
#   ./git.sh --init             First-time setup: set branch to main, add remote, push -u origin main.
#   ./git.sh --help
#
# Safe to run anytime: if there is nothing to commit it will skip the commit,
# and if the remote already exists it won't try to re-add it.
#
set -euo pipefail

# ---- Config ---------------------------------------------------------------
REMOTE_URL="https://github.com/thism3d/IncomeExpenseTracker.git"
REMOTE_NAME="origin"
BRANCH="main"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- Pretty output (ASCII only, safe in any terminal) ---------------------
BOLD="$(tput bold 2>/dev/null || echo '')"
DIM="$(tput dim 2>/dev/null || echo '')"
RED="$(tput setaf 1 2>/dev/null || echo '')"
GRN="$(tput setaf 2 2>/dev/null || echo '')"
YLW="$(tput setaf 3 2>/dev/null || echo '')"
BLU="$(tput setaf 4 2>/dev/null || echo '')"
RST="$(tput sgr0 2>/dev/null || echo '')"
step() { printf '%s>> %s%s\n' "${BLU}${BOLD}" "$*" "${RST}"; }
ok()   { printf '%s[OK] %s%s\n' "${GRN}" "$*" "${RST}"; }
warn() { printf '%s[!]  %s%s\n' "${YLW}" "$*" "${RST}"; }
die()  { printf '%s[X]  %s%s\n' "${RED}" "$*" "${RST}" >&2; exit 1; }

# ---- Args -----------------------------------------------------------------
DO_INIT=0
COMMIT_MSG=""
if [[ $# -gt 0 ]]; then
  case "$1" in
    -h|--help)
      awk 'NR>1 && /^#/{sub(/^# ?/,""); print; next} NR>1{exit}' "$0"; exit 0 ;;
    --init)
      DO_INIT=1 ;;
    -*)
      die "Unknown option: $1 (try --help)" ;;
    *)
      COMMIT_MSG="$1" ;;
  esac
fi

# ---- Sanity checks --------------------------------------------------------
command -v git >/dev/null 2>&1 || die "git is not installed."

if [[ ! -d .git ]] && ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  step "No git repo found -- initializing..."
  git init
fi

# Make sure the default branch is 'main'.
if [[ "$(git symbolic-ref --short HEAD 2>/dev/null)" != "$BRANCH" ]]; then
  step "Setting branch to '$BRANCH'..."
  git branch -M "$BRANCH"
fi

# Make sure the remote exists (no-op if already configured).
if ! git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  step "Adding remote $REMOTE_NAME -> $REMOTE_URL"
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
else
  current_url="$(git remote get-url "$REMOTE_NAME")"
  if [[ "$current_url" != "$REMOTE_URL" ]]; then
    warn "Remote '$REMOTE_NAME' points to $current_url (expected $REMOTE_URL). Updating..."
    git remote set-url "$REMOTE_NAME" "$REMOTE_URL"
  fi
fi
ok "Remote ready: $(git remote get-url "$REMOTE_NAME")"

# ---- Stage ----------------------------------------------------------------
step "Staging changes (git add .)..."
git add .

# Anything staged?
if git diff --cached --quiet; then
  ok "Nothing to commit -- working tree clean."
else
  # Ask for a commit message if none was passed.
  if [[ -z "$COMMIT_MSG" ]]; then
    echo "${DIM}-- staged files --${RST}"
    git diff --cached --name-only | sed 's/^/    /'
    echo
    read -r -p "${BOLD}Commit message: ${RST}" COMMIT_MSG
    [[ -n "${COMMIT_MSG:-}" ]] || die "Empty commit message -- aborted."
  fi

  step "Committing..."
  git commit -m "$COMMIT_MSG"
  ok "Committed: $COMMIT_MSG"
fi

# ---- Push -----------------------------------------------------------------
step "Pushing to ${REMOTE_NAME}/${BRANCH}..."
# Use -u on first push (or --init); otherwise a normal push.
if [[ $DO_INIT -eq 1 ]] || ! git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git push -u "$REMOTE_NAME" "$BRANCH"
else
  git push "$REMOTE_NAME" "$BRANCH"
fi

ok "${BOLD}Done.${RST}  $(git log -1 --oneline | sed 's/^/  /')"
