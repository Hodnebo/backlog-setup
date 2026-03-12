#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# backlog-setup bootstrap installer
#
# Curl-pipe-bash wrapper around setup.sh. Clones the repo to a temp directory,
# runs setup.sh with all forwarded arguments, then cleans up.
#
# Usage:
#   curl -LsSf https://raw.githubusercontent.com/Hodnebo/backlog-setup/main/install.sh | bash
#   curl -LsSf https://raw.githubusercontent.com/Hodnebo/backlog-setup/main/install.sh | bash -s -- /path/to/project
#   curl -LsSf https://raw.githubusercontent.com/Hodnebo/backlog-setup/main/install.sh | bash -s -- --update /path/to/project
# ─────────────────────────────────────────────────────────────────────────────

REPO_URL="https://github.com/Hodnebo/backlog-setup.git"
CLONE_DIR=""

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
fail()  { echo -e "${RED}[error]${NC} $*"; exit 1; }

cleanup() {
  if [ -n "$CLONE_DIR" ] && [ -d "$CLONE_DIR" ]; then
    rm -rf "$CLONE_DIR"
  fi
}
trap cleanup EXIT

# ─────────────────────────────────────────────────────────────────────────────
# Pre-flight checks
# ─────────────────────────────────────────────────────────────────────────────

if ! command -v git &>/dev/null; then
  fail "git is required but not installed. Install git first, then re-run this script."
fi

# ─────────────────────────────────────────────────────────────────────────────
# Clone and run
# ─────────────────────────────────────────────────────────────────────────────

CLONE_DIR="$(mktemp -d)"
info "Cloning backlog-setup to temp directory..."
git clone --depth 1 --quiet "$REPO_URL" "$CLONE_DIR" || \
  fail "Could not clone $REPO_URL — check your network connection."
ok "Repository cloned"

info "Running setup.sh..."
echo ""
bash "$CLONE_DIR/setup.sh" "$@"
