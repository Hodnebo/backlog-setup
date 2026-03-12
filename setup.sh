#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# backlog-setup: One-command AI kanban board with semantic search
#
# Sets up:
#   - Backlog.md (markdown kanban board + MCP server)
#   - mcp-local-rag (local vector search + MCP server) with auto-ingestion
#   - MCP configs for OpenCode, Claude Code, and Cursor
#
# Usage:
#   curl -LsSf https://raw.githubusercontent.com/Hodnebo/backlog-setup/main/install.sh | bash
#   # or clone and run directly:
#   git clone https://github.com/Hodnebo/backlog-setup.git ~/backlog-setup
#   ~/backlog-setup/setup.sh /path/to/target/repo
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
fail()  { echo -e "${RED}[error]${NC} $*"; exit 1; }

REPLY_CHOICE=""

ask_yn() {
  local prompt="$1" default="${2:-y}"
  if [ "$INTERACTIVE" = false ]; then
    [[ "$default" = "y" ]]
    return
  fi
  local yn
  if [ "$default" = "y" ]; then
    read -rp "  $prompt [Y/n]: " yn
    [[ -z "$yn" || "$yn" =~ ^[Yy] ]]
  else
    read -rp "  $prompt [y/N]: " yn
    [[ "$yn" =~ ^[Yy] ]]
  fi
}

ask_choice() {
  local prompt="$1" default="$2"
  shift 2
  local options=("$@")
  if [ "$INTERACTIVE" = false ]; then
    REPLY_CHOICE="$default"
    return
  fi
  echo ""
  echo -e "  ${BLUE}${prompt}${NC}"
  for i in "${!options[@]}"; do
    echo "    $((i + 1))) ${options[$i]}"
  done
  local choice
  read -rp "  Choice [$default]: " choice
  REPLY_CHOICE="${choice:-$default}"
}

# ─────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────────────────────────────

LOCAL_CACHE=false
SUBMODULE_MODE=false
BACKLOG_REMOTE=""
UPDATE_MODE=false
INTERACTIVE=true
AUTO_COMMIT=true
EDITOR_CONFIG="all"
TARGET_DIR=""

# Track which options were explicitly set via CLI flags
FLAG_LOCAL_CACHE=false
FLAG_SUBMODULE=false

usage() {
  cat <<EOF
Usage: setup.sh [OPTIONS] [TARGET_DIR]

Sets up an AI kanban board with semantic search in TARGET_DIR (default: current directory).

Options:
  --local-cache               Use a per-repo model cache instead of the shared
                              cache at ~/.mcp-local-rag-models. The model (~90MB)
                              will be stored in TARGET_DIR/.mcp-local-rag-models.
  --submodule                 Initialize backlog/ as a git submodule instead of a
                              plain directory. Task commits stay in a separate repo.
  --backlog-remote <url>      Remote URL for the backlog submodule repo. Requires
                              --submodule. If omitted with --submodule, a local
                              repo is created (add remote later).
  --update                    Refresh MCP configs and AGENTS.md workflow section
                               from latest templates.
  --yes, -y                   Skip interactive prompts and use defaults.
                              Also activates automatically when stdin is not a terminal
                              (e.g. curl | bash).
  --help                      Show this help message and exit.
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local-cache)
      LOCAL_CACHE=true
      FLAG_LOCAL_CACHE=true
      shift
      ;;
    --submodule)
      SUBMODULE_MODE=true
      FLAG_SUBMODULE=true
      shift
      ;;
    --yes|-y)
      INTERACTIVE=false
      shift
      ;;
    --backlog-remote)
      [[ -z "${2:-}" ]] && fail "--backlog-remote requires a URL argument"
      BACKLOG_REMOTE="$2"
      shift 2
      ;;
    --update)
      UPDATE_MODE=true
      shift
      ;;
    --help|-h)
      usage
      ;;
    -*)
      fail "Unknown option: $1 (see --help)"
      ;;
    *)
      TARGET_DIR="$1"
      shift
      ;;
  esac
done

if [ -n "$BACKLOG_REMOTE" ] && [ "$SUBMODULE_MODE" = false ]; then
  fail "--backlog-remote requires --submodule"
fi

if [ "$SUBMODULE_MODE" = true ] && ! command -v git &>/dev/null; then
  fail "--submodule requires git but git is not installed"
fi

if [ "$SUBMODULE_MODE" = true ]; then
  info "Submodule mode enabled"
fi

# Fall back to non-interactive when stdin is not a terminal (e.g. curl | bash)
if [ "$INTERACTIVE" = true ] && [ ! -t 0 ]; then
  INTERACTIVE=false
fi

TARGET_DIR="${TARGET_DIR:-$(pwd)}"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

# Detect self-install (running setup.sh inside its own repo)
SELF_INSTALL=false
if [ "$SCRIPT_DIR" = "$TARGET_DIR" ]; then
  SELF_INSTALL=true
fi

SHARED_DIR="$HOME/.local/share/backlog-setup"
SHARED_CACHE="$HOME/.mcp-local-rag-models"
LOCAL_CACHE_DIR="$TARGET_DIR/.mcp-local-rag-models"

if [ "$LOCAL_CACHE" = true ]; then
  CACHE_DIR_VALUE="$LOCAL_CACHE_DIR"
else
  CACHE_DIR_VALUE="$SHARED_CACHE"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Pre-flight checks
# ─────────────────────────────────────────────────────────────────────────────

info "Setting up AI kanban in: $TARGET_DIR"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  fail "Node.js is required but not installed. Install from https://nodejs.org"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js 18+ required (found v$(node -v))"
fi
ok "Node.js $(node -v)"

# Check npm
if ! command -v npm &>/dev/null; then
  fail "npm is required but not found"
fi
ok "npm $(npm -v)"

# Check backlog.md
if ! command -v backlog &>/dev/null; then
  info "Installing backlog.md globally..."
  npm install -g backlog.md
fi
ok "backlog.md $(backlog --version 2>/dev/null || echo 'installed')"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Configuration wizard (interactive mode)
# ─────────────────────────────────────────────────────────────────────────────

if [ "$INTERACTIVE" = true ]; then
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE} Configuration${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  if [ "$FLAG_LOCAL_CACHE" = false ]; then
    ask_choice "Model cache location:" "1" \
      "Shared (~/.mcp-local-rag-models) — one download, shared across repos" \
      "Per-repo (.mcp-local-rag-models/) — isolated, uses more disk"
    case "$REPLY_CHOICE" in
      2) LOCAL_CACHE=true ;;
    esac
  fi

  if [ "$FLAG_SUBMODULE" = false ]; then
    ask_choice "Backlog storage mode:" "1" \
      "Plain directory — tracked in project git" \
      "Git submodule — separate repo for task history"
    case "$REPLY_CHOICE" in
      2) SUBMODULE_MODE=true ;;
    esac
  fi

  if [ "$SUBMODULE_MODE" = true ] && [ -z "$BACKLOG_REMOTE" ]; then
    echo ""
    echo -e "  ${BLUE}Backlog remote URL (leave empty for local-only):${NC}"
    read -rp "  URL: " BACKLOG_REMOTE
  fi

  if ask_yn "Auto-commit task changes?" "y"; then
    AUTO_COMMIT=true
  else
    AUTO_COMMIT=false
  fi

  ask_choice "Editor configs to generate:" "1" \
    "All — OpenCode + Claude Code / Cursor" \
    "OpenCode only" \
    "Claude Code / Cursor only (.mcp.json)"
  case "$REPLY_CHOICE" in
    2) EDITOR_CONFIG="opencode" ;;
    3) EDITOR_CONFIG="claude" ;;
    *) EDITOR_CONFIG="all" ;;
  esac

  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE} Summary${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "  Target:      $TARGET_DIR"
  if [ "$LOCAL_CACHE" = true ]; then
    echo "  Cache:       Per-repo (.mcp-local-rag-models/)"
  else
    echo "  Cache:       Shared (~/.mcp-local-rag-models)"
  fi
  if [ "$SUBMODULE_MODE" = true ]; then
    if [ -n "$BACKLOG_REMOTE" ]; then
      echo "  Storage:     Git submodule ($BACKLOG_REMOTE)"
    else
      echo "  Storage:     Git submodule (local)"
    fi
  else
    echo "  Storage:     Plain directory"
  fi
  if [ "$AUTO_COMMIT" = true ]; then
    echo "  Auto-commit: Enabled"
  else
    echo "  Auto-commit: Disabled"
  fi
  case "$EDITOR_CONFIG" in
    all)      echo "  Editors:     All (OpenCode + Claude Code / Cursor)" ;;
    opencode) echo "  Editors:     OpenCode only" ;;
    claude)   echo "  Editors:     Claude Code / Cursor only" ;;
  esac
  echo ""

  if ! ask_yn "Proceed?" "y"; then
    echo "Aborted."
    exit 0
  fi
  echo ""
fi

# Recompute cache dir (wizard may have changed LOCAL_CACHE)
if [ "$LOCAL_CACHE" = true ]; then
  CACHE_DIR_VALUE="$LOCAL_CACHE_DIR"
else
  CACHE_DIR_VALUE="$SHARED_CACHE"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Initialize backlog (if not already)
# ─────────────────────────────────────────────────────────────────────────────

cd "$TARGET_DIR"

if [ -d "backlog" ] && [ -f "backlog/config.yml" ]; then
  ok "Backlog already initialized"
elif [ "$SUBMODULE_MODE" = true ] && [ -n "$BACKLOG_REMOTE" ] && [ ! -d "backlog" ]; then
  # Defer init — submodule add will clone the remote first, then we init inside it
  info "Deferring backlog init (submodule with remote — will clone first)"
else
  info "Initializing backlog..."

  # Detect project name from directory or git remote
  PROJECT_NAME=$(basename "$TARGET_DIR")
  if git rev-parse --is-inside-work-tree &>/dev/null; then
    REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
    if [ -n "$REMOTE_URL" ]; then
      PROJECT_NAME=$(basename "$REMOTE_URL" .git)
    fi
  fi

  backlog init "$PROJECT_NAME" --integration-mode mcp --defaults 2>/dev/null || true

  if ! git remote get-url origin &>/dev/null 2>&1; then
    backlog config set remoteOperations false 2>/dev/null || true
  fi

  ok "Backlog initialized as '$PROJECT_NAME'"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Submodule mode: wire backlog/ as a git submodule
# ─────────────────────────────────────────────────────────────────────────────

if [ "$SUBMODULE_MODE" = true ]; then
  # Ensure we are inside a git repo
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    fail "--submodule requires TARGET_DIR to be a git repository"
  fi

  BACKLOG_DIR="$TARGET_DIR/backlog"

  # Case A: backlog/ is already a submodule — nothing to do
  if git submodule status backlog &>/dev/null 2>&1; then
    ok "backlog/ is already a submodule"

  # Case B: fresh clone where .gitmodules lists backlog but it is not initialized
  elif [ -f ".gitmodules" ] && grep -q 'path = backlog' .gitmodules; then
    info "Initializing backlog submodule from .gitmodules..."
    git submodule update --init backlog
    ok "backlog submodule initialized"

  # Case C: backlog/ exists as a plain directory — convert to submodule
  elif [ -d "$BACKLOG_DIR" ] && [ ! -d "$BACKLOG_DIR/.git" ]; then
    info "Converting existing backlog/ to a submodule..."

    git rm -r --cached backlog >/dev/null 2>&1 || true

    if [ -n "$BACKLOG_REMOTE" ]; then
      # Save local content, clone remote, merge local content on top
      BACKLOG_TMP=$(mktemp -d)
      cp -a "$BACKLOG_DIR"/. "$BACKLOG_TMP"/
      rm -rf "$BACKLOG_DIR"
      git submodule add "$BACKLOG_REMOTE" backlog

      # Copy local content into the submodule (overwrite remote files)
      cp -a "$BACKLOG_TMP"/. "$BACKLOG_DIR"/
      rm -rf "$BACKLOG_TMP"

      # Commit and push the merged content inside the submodule
      git -C "$BACKLOG_DIR" add -A
      if ! git -C "$BACKLOG_DIR" diff --cached --quiet; then
        git -C "$BACKLOG_DIR" commit -q -m "Add backlog content from parent project"
        git -C "$BACKLOG_DIR" push origin "$(git -C "$BACKLOG_DIR" branch --show-current)" 2>/dev/null || \
          warn "Could not push to $BACKLOG_REMOTE — push manually later"
      fi
    else
      # No remote: create a bare repo next to the project for the submodule reference
      BARE_REPO="$TARGET_DIR/.backlog-repo.git"
      git -C "$BACKLOG_DIR" init -q
      git -C "$BACKLOG_DIR" add -A
      git -C "$BACKLOG_DIR" commit -q -m "Initial backlog content"
      git clone --bare -q "$BACKLOG_DIR" "$BARE_REPO"
      rm -rf "$BACKLOG_DIR"
      git submodule add "$BARE_REPO" backlog
      info "Local bare repo created at .backlog-repo.git — add a real remote later:"
      info "  cd backlog && git remote set-url origin <url> && git push -u origin main"
    fi

    ok "backlog/ converted to submodule"

  # Case D: backlog/ already has .git (standalone repo) — wire as submodule
  elif [ -d "$BACKLOG_DIR/.git" ]; then
    EXISTING_REMOTE=$(git -C "$BACKLOG_DIR" remote get-url origin 2>/dev/null || echo "")
    SUBMODULE_URL="${BACKLOG_REMOTE:-$EXISTING_REMOTE}"

    if [ -z "$SUBMODULE_URL" ]; then
      # No remote anywhere — create a bare repo
      BARE_REPO="$TARGET_DIR/.backlog-repo.git"
      git clone --bare -q "$BACKLOG_DIR" "$BARE_REPO"
      SUBMODULE_URL="$BARE_REPO"
      info "Local bare repo created at .backlog-repo.git"
    fi

    rm -rf "$BACKLOG_DIR"
    git rm -r --cached backlog >/dev/null 2>&1 || true
    git submodule add "$SUBMODULE_URL" backlog
    ok "backlog/ wired as submodule from $SUBMODULE_URL"

  # Case E: fresh setup — add submodule from scratch
  else
    if [ -n "$BACKLOG_REMOTE" ]; then
      git submodule add "$BACKLOG_REMOTE" backlog
      ok "backlog submodule added from $BACKLOG_REMOTE"
    else
      # No remote, no existing dir — backlog init already created it above,
      # but this branch means backlog/ doesn't exist yet (shouldn't happen
      # since backlog init runs first). Guard anyway.
      fail "backlog/ does not exist and no --backlog-remote provided. Run without --submodule first, or provide a remote."
    fi
  fi

  # After submodule setup, ensure backlog is initialized inside it
  if [ ! -f "$BACKLOG_DIR/config.yml" ]; then
    info "Initializing backlog inside submodule..."
    PROJECT_NAME=$(basename "$TARGET_DIR")
    if git rev-parse --is-inside-work-tree &>/dev/null; then
      REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
      if [ -n "$REMOTE_URL" ]; then
        PROJECT_NAME=$(basename "$REMOTE_URL" .git)
      fi
    fi

    backlog init "$PROJECT_NAME" --integration-mode mcp --defaults 2>/dev/null || true

    if ! git remote get-url origin &>/dev/null 2>&1; then
      backlog config set remoteOperations false 2>/dev/null || true
    fi

    # Commit and push the init content inside the submodule
    git -C "$BACKLOG_DIR" add -A
    if ! git -C "$BACKLOG_DIR" diff --cached --quiet; then
      git -C "$BACKLOG_DIR" commit -q -m "Initialize backlog"
      git -C "$BACKLOG_DIR" push origin "$(git -C "$BACKLOG_DIR" branch --show-current)" 2>/dev/null || \
        warn "Could not push backlog init to remote — push manually later"
    fi

    ok "Backlog initialized inside submodule as '$PROJECT_NAME'"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Install shared components (~/.local/share/backlog-setup/)
# ─────────────────────────────────────────────────────────────────────────────

LIB_SRC_DIR="$SCRIPT_DIR/lib"
REPO_RAW="https://raw.githubusercontent.com/Hodnebo/backlog-setup/main"
LIB_FILES="rag-server.mjs preprocessing.mjs exclusion.mjs discovery.mjs hashing.mjs ingestion.mjs workflow-guides.mjs backlog-proxy.mjs"

info "Shared install location: $SHARED_DIR"

# -- lib/ modules -------------------------------------------------------------

mkdir -p "$SHARED_DIR/lib"
if [ -d "$LIB_SRC_DIR" ]; then
  for f in $LIB_FILES; do
    cp "$LIB_SRC_DIR/$f" "$SHARED_DIR/lib/$f"
  done
else
  for f in $LIB_FILES; do
    curl -fsSL "$REPO_RAW/lib/$f" -o "$SHARED_DIR/lib/$f" 2>/dev/null || \
      fail "Could not download lib/$f. Run setup from the cloned repo instead."
  done
fi
ok "lib/ modules installed to shared location ($(echo $LIB_FILES | wc -w | tr -d ' ') files)"

# -- backlog-commit-hook.sh --------------------------------------------------

COMMIT_HOOK_SRC="$SCRIPT_DIR/backlog-commit-hook.sh"

if [ ! -f "$COMMIT_HOOK_SRC" ]; then
  COMMIT_HOOK_SRC="/tmp/backlog-setup-commit-hook.sh"
  curl -fsSL "$REPO_RAW/backlog-commit-hook.sh" -o "$COMMIT_HOOK_SRC" 2>/dev/null || \
    warn "Could not download backlog-commit-hook.sh — auto-commit disabled"
fi

if [ -f "$COMMIT_HOOK_SRC" ]; then
  cp "$COMMIT_HOOK_SRC" "$SHARED_DIR/backlog-commit-hook.sh"
  chmod +x "$SHARED_DIR/backlog-commit-hook.sh"
  ok "backlog-commit-hook.sh installed to shared location"
fi

# -- mcp-local-rag dependency (shared) ---------------------------------------

if [ "$UPDATE_MODE" = true ] || [ ! -f "$SHARED_DIR/node_modules/mcp-local-rag/package.json" ]; then
  info "Installing mcp-local-rag to shared location..."
  if [ ! -f "$SHARED_DIR/package.json" ]; then
    (cd "$SHARED_DIR" && npm init -y --silent 2>/dev/null)
  fi
  (cd "$SHARED_DIR" && npm install mcp-local-rag --save --silent 2>/dev/null)
  ok "mcp-local-rag installed (shared)"
else
  ok "mcp-local-rag already installed (shared)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Migrate per-project copies to shared location
# ─────────────────────────────────────────────────────────────────────────────

MIGRATION_DONE=false

if [ "$SELF_INSTALL" = false ] && [ -f "$TARGET_DIR/lib/rag-server.mjs" ]; then
  info "Migrating from per-project lib/ to shared location..."
  rm -rf "$TARGET_DIR/lib"
  ok "Removed $TARGET_DIR/lib/ (now at $SHARED_DIR/lib/)"
  MIGRATION_DONE=true
fi

if [ "$SELF_INSTALL" = false ] && [ -f "$TARGET_DIR/backlog-commit-hook.sh" ]; then
  rm -f "$TARGET_DIR/backlog-commit-hook.sh"
  ok "Removed per-project backlog-commit-hook.sh (now at $SHARED_DIR/)"
  MIGRATION_DONE=true
fi

if [ "$SELF_INSTALL" = false ] && [ -d "$TARGET_DIR/node_modules/mcp-local-rag" ]; then
  info "Removing per-project mcp-local-rag (now in shared location)..."
  (cd "$TARGET_DIR" && npm uninstall mcp-local-rag --save --silent 2>/dev/null) || true
  ok "Removed per-project mcp-local-rag dependency"
  MIGRATION_DONE=true
fi

if [ "$MIGRATION_DONE" = true ]; then
  UPDATE_MODE=true
fi

# ─────────────────────────────────────────────────────────────────────────────
# Install backlog semantic search skill (OpenCode)
# ─────────────────────────────────────────────────────────────────────────────

SKILL_SRC="$SCRIPT_DIR/skills/backlog-semantic-search.md"
SKILL_DEST="$TARGET_DIR/.opencode/skills/backlog-semantic-search.md"

if [ "$EDITOR_CONFIG" = "all" ] || [ "$EDITOR_CONFIG" = "opencode" ]; then
if [ "$SELF_INSTALL" = true ]; then
  ok "Skill already in place (self-install)"
elif [ -f "$SKILL_SRC" ]; then
  mkdir -p "$TARGET_DIR/.opencode/skills"
  cp "$SKILL_SRC" "$SKILL_DEST"
  ok "Backlog semantic search skill installed (.opencode/skills/)"
else
  mkdir -p "$TARGET_DIR/.opencode/skills"
  curl -fsSL "$REPO_RAW/skills/backlog-semantic-search.md" -o "$SKILL_DEST" 2>/dev/null || \
    warn "Could not download backlog-semantic-search.md — skipping skill install"
  if [ -f "$SKILL_DEST" ]; then
    ok "Backlog semantic search skill installed (.opencode/skills/)"
  fi
fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Write MCP configs
# ─────────────────────────────────────────────────────────────────────────────

MCP_RAG_ENV_EXTRA=""
OC_RAG_ENV_EXTRA=""
if [ "$AUTO_COMMIT" = false ]; then
  MCP_RAG_ENV_EXTRA=',
      "BACKLOG_AUTO_COMMIT": "false"'
  OC_RAG_ENV_EXTRA=',
      "BACKLOG_AUTO_COMMIT": "false"'
fi

# .mcp.json (Claude Code / Cursor)
if [ "$EDITOR_CONFIG" = "all" ] || [ "$EDITOR_CONFIG" = "claude" ]; then
if [ -f ".mcp.json" ] && [ "$UPDATE_MODE" = false ]; then
  warn ".mcp.json already exists — skipping (use --update to refresh)"
else
  BACKLOG_MCP_SERVERS=$(cat <<MCPFRAG
{
  "backlog": {
    "command": "node",
    "args": ["$SHARED_DIR/lib/backlog-proxy.mjs"],
    "env": {
      "BACKLOG_CWD": "$TARGET_DIR"
    }
  },
  "backlog-rag": {
    "command": "node",
    "args": ["$SHARED_DIR/lib/rag-server.mjs"],
    "env": {
      "BASE_DIR": "$TARGET_DIR/backlog",
      "DB_PATH": "$TARGET_DIR/.lancedb",
      "CACHE_DIR": "$CACHE_DIR_VALUE"$MCP_RAG_ENV_EXTRA
    }
  }
}
MCPFRAG
  )
  if [ -f ".mcp.json" ]; then
    node -e "
      const fs = require('fs');
      const existing = JSON.parse(fs.readFileSync('.mcp.json', 'utf8'));
      const servers = JSON.parse(process.argv[1]);
      existing.mcpServers = { ...existing.mcpServers, ...servers };
      fs.writeFileSync('.mcp.json', JSON.stringify(existing, null, 2) + '\n');
    " "$BACKLOG_MCP_SERVERS"
    info "Merged backlog servers into existing .mcp.json"
  else
    cat > .mcp.json <<MCPJSON
{
  "mcpServers": $BACKLOG_MCP_SERVERS
}
MCPJSON
  fi
  ok ".mcp.json created (Claude Code / Cursor)"
fi
fi

# opencode.json (OpenCode)
if [ "$EDITOR_CONFIG" = "all" ] || [ "$EDITOR_CONFIG" = "opencode" ]; then
if [ -f "opencode.json" ] && [ "$UPDATE_MODE" = false ]; then
  warn "opencode.json already exists — skipping (use --update to refresh)"
else
  BACKLOG_OC_SERVERS=$(cat <<OCFRAG
{
  "backlog": {
    "type": "local",
    "command": ["node", "$SHARED_DIR/lib/backlog-proxy.mjs"],
    "environment": {
      "BACKLOG_CWD": "$TARGET_DIR"
    },
    "enabled": true
  },
  "backlog-rag": {
    "type": "local",
    "command": ["node", "$SHARED_DIR/lib/rag-server.mjs"],
    "environment": {
      "BASE_DIR": "$TARGET_DIR/backlog",
      "DB_PATH": "$TARGET_DIR/.lancedb",
      "CACHE_DIR": "$CACHE_DIR_VALUE"$OC_RAG_ENV_EXTRA
    },
    "enabled": true
  }
}
OCFRAG
  )
  if [ -f "opencode.json" ]; then
    node -e "
      const fs = require('fs');
      const existing = JSON.parse(fs.readFileSync('opencode.json', 'utf8'));
      const servers = JSON.parse(process.argv[1]);
      existing.mcp = { ...existing.mcp, ...servers };
      fs.writeFileSync('opencode.json', JSON.stringify(existing, null, 2) + '\n');
    " "$BACKLOG_OC_SERVERS"
    info "Merged backlog servers into existing opencode.json"
  else
    cat > opencode.json <<OCJSON
{
  "\$schema": "https://opencode.ai/config.json",
  "mcp": $BACKLOG_OC_SERVERS
}
OCJSON
  fi
  ok "opencode.json created (OpenCode)"
fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Update .gitignore
# ─────────────────────────────────────────────────────────────────────────────

GITIGNORE_ENTRIES=(
  "# MCP configs (contain machine-specific absolute paths)"
  ".mcp.json"
  "opencode.json"
  ""
  "# RAG vector database"
  ".lancedb/"
  ""
  "# RAG model cache"
  ".mcp-local-rag-models/"
  ""
  "# Node"
  "node_modules/"
  ""
  "# Backlog submodule bare repo (if using --submodule without remote)"
  ".backlog-repo.git"
)

if [ -f ".gitignore" ]; then
  ADDED=0
  for entry in ".mcp.json" "opencode.json" ".lancedb/" ".mcp-local-rag-models/" "node_modules/" ".backlog-repo.git"; do
    if ! grep -qF "$entry" .gitignore; then
      echo "$entry" >> .gitignore
      ADDED=1
    fi
  done
  if [ "$ADDED" -eq 1 ]; then
    ok ".gitignore updated"
  else
    ok ".gitignore already has required entries"
  fi
else
  printf '%s\n' "${GITIGNORE_ENTRIES[@]}" > .gitignore
  ok ".gitignore created"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Append backlog workflow to AGENTS.md
# ─────────────────────────────────────────────────────────────────────────────

AGENTS_MARKER="<!-- BACKLOG_WORKFLOW:BEGIN -->"
AGENTS_MARKER_END="<!-- BACKLOG_WORKFLOW:END -->"

# If --update, remove old Backlog Workflow section so it gets re-appended below
if [ "$UPDATE_MODE" = true ] && [ -f "AGENTS.md" ] && grep -qF "$AGENTS_MARKER" AGENTS.md; then
    TEMP_FILE=$(mktemp)
    sed "/$AGENTS_MARKER/,/$AGENTS_MARKER_END/d" AGENTS.md > "$TEMP_FILE"
    sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$TEMP_FILE" > "${TEMP_FILE}.trim"
    mv "${TEMP_FILE}.trim" AGENTS.md
    rm -f "$TEMP_FILE"
    info "Removed old Backlog Workflow section from AGENTS.md"
fi

if [ -f "AGENTS.md" ] && grep -qF "$AGENTS_MARKER" AGENTS.md; then
  ok "AGENTS.md already has backlog workflow section"
else
  cat >> AGENTS.md <<'AGENTSEOF'

<!-- BACKLOG_WORKFLOW:BEGIN -->

## Backlog Workflow

Before starting any work:

1. Run `backlog_task_list` to see current tasks and their statuses
2. Check if the work you are about to do is already tracked as a task

While working:

- If no task exists for your work, create one with `backlog_task_create` and set status to "In Progress"
- If a task exists, move it to "In Progress" with `backlog_task_edit`
- Break large efforts into subtasks

After completing work:

- Use `backlog_task_complete` to mark the task as complete (do NOT use `backlog_task_edit` to set status to Done)
- Fill in the `finalSummary` with what changed and why

Use `backlog_semantic_search` for natural-language task discovery ("what needs performance work?") and `backlog_task_search` for exact lookups ("TASK-12", "authentication").
AGENTSEOF

  echo '<!-- BACKLOG_WORKFLOW:END -->' >> AGENTS.md
  ok "AGENTS.md updated with backlog workflow"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Migrate per-repo model cache to shared cache (if applicable)
# ─────────────────────────────────────────────────────────────────────────────

if [ "$LOCAL_CACHE" = false ] && [ -d "$LOCAL_CACHE_DIR/Xenova" ]; then
  if [ ! -d "$SHARED_CACHE/Xenova" ]; then
    info "Moving per-repo model cache to shared location ($SHARED_CACHE)..."
    mkdir -p "$SHARED_CACHE"
    mv "$LOCAL_CACHE_DIR"/* "$SHARED_CACHE"/ 2>/dev/null || true
    rmdir "$LOCAL_CACHE_DIR" 2>/dev/null || true
    ok "Model cache migrated to $SHARED_CACHE (saved ~90MB in this repo)"
  else
    info "Removing redundant per-repo model cache (shared cache already exists)..."
    rm -rf "$LOCAL_CACHE_DIR"
    ok "Per-repo cache removed (shared cache at $SHARED_CACHE)"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Pre-download embedding model (so first MCP startup is fast)
# ─────────────────────────────────────────────────────────────────────────────

if [ -d "$CACHE_DIR_VALUE/Xenova" ]; then
  ok "Embedding model already cached ($CACHE_DIR_VALUE)"
else
  info "Pre-downloading embedding model (~90MB, one-time) to $CACHE_DIR_VALUE..."
  (cd "$SHARED_DIR" && \
  BASE_DIR="$TARGET_DIR/backlog" \
  DB_PATH="$TARGET_DIR/.lancedb" \
  CACHE_DIR="$CACHE_DIR_VALUE" \
  node -e "
    import('mcp-local-rag/dist/server/index.js').then(async ({ RAGServer }) => {
      const s = new RAGServer({
        dbPath: '$TARGET_DIR/.lancedb',
        modelName: 'Xenova/all-MiniLM-L6-v2',
        cacheDir: '$CACHE_DIR_VALUE',
        baseDir: '$TARGET_DIR/backlog',
        maxFileSize: 104857600,
      });
      await s.initialize();
      console.log('Model cache ready');
      process.exit(0);
    }).catch(e => { console.error(e.message); process.exit(0); });
  " 2>/dev/null) || warn "Model pre-download skipped (will download on first use)"
  ok "Embedding model cached at $CACHE_DIR_VALUE"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN} AI Kanban Board ready!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Files created:"
echo "    backlog/                 — kanban board data (tasks, docs, milestones)"
if [ "$EDITOR_CONFIG" = "all" ] || [ "$EDITOR_CONFIG" = "claude" ]; then
echo "    .mcp.json                — MCP config for Claude Code / Cursor"
fi
if [ "$EDITOR_CONFIG" = "all" ] || [ "$EDITOR_CONFIG" = "opencode" ]; then
echo "    opencode.json            — MCP config for OpenCode"
fi
echo ""
echo "  Shared install ($SHARED_DIR):"
echo "    lib/                     — modular RAG server (8 modules)"
echo "    backlog-commit-hook.sh   — auto-commit after task operations"
echo "    node_modules/            — mcp-local-rag dependency"
if [ "$SUBMODULE_MODE" = true ]; then
echo ""
echo "  Submodule mode:"
echo "    backlog/ is a git submodule — task commits stay in a separate repo"
echo "    Commit workflow: cd backlog && git add -A && git commit && git push"
fi
echo ""
echo "  Quick start:"
echo "    backlog board              — view kanban in terminal"
echo "    backlog browser            — open web UI (localhost:6420)"
echo "    backlog task create \"Do X\" — create a task"
echo ""
echo "  MCP servers (auto-start in your AI editor):"
echo "    backlog     — 22 tools for task management"
echo "    backlog-rag — semantic search (auto-ingests on startup)"
if [ "$EDITOR_CONFIG" = "all" ] || [ "$EDITOR_CONFIG" = "opencode" ]; then
echo ""
echo "  Installed skill:"
echo "    .opencode/skills/backlog-semantic-search.md"
fi
echo ""
echo "  The RAG index syncs automatically every time your AI"
echo "  editor opens this repo. No manual steps needed."
echo ""
if [ "$AUTO_COMMIT" = true ]; then
echo "  Auto-commit: task changes are committed automatically."
echo "  Disable with: BACKLOG_AUTO_COMMIT=false"
else
echo "  Auto-commit: disabled."
echo "  Enable with: BACKLOG_AUTO_COMMIT=true in your MCP config env"
fi
echo ""
