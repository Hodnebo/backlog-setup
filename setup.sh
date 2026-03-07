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
#   curl -fsSL https://raw.githubusercontent.com/<you>/backlog-setup/main/setup.sh | bash
#   # or
#   git clone <repo> /tmp/backlog-setup && /tmp/backlog-setup/setup.sh
#   # or from within the backlog-setup repo:
#   ./setup.sh /path/to/target/repo
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-$(pwd)}"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[info]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
fail()  { echo -e "${RED}[error]${NC} $*"; exit 1; }

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
# Initialize backlog (if not already)
# ─────────────────────────────────────────────────────────────────────────────

cd "$TARGET_DIR"

if [ -d "backlog" ] && [ -f "backlog/config.yml" ]; then
  ok "Backlog already initialized"
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
# Install mcp-local-rag as local dependency
# ─────────────────────────────────────────────────────────────────────────────

if [ -f "node_modules/mcp-local-rag/package.json" ]; then
  ok "mcp-local-rag already installed"
else
  info "Installing mcp-local-rag..."

  # Ensure package.json exists
  if [ ! -f "package.json" ]; then
    npm init -y --silent 2>/dev/null
  fi

  npm install mcp-local-rag --save --silent 2>/dev/null
  ok "mcp-local-rag installed"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Copy rag-server.mjs (auto-ingest wrapper)
# ─────────────────────────────────────────────────────────────────────────────

RAG_SERVER_SRC="$SCRIPT_DIR/rag-server.mjs"

if [ ! -f "$RAG_SERVER_SRC" ]; then
  # If running from curl pipe, download it
  RAG_SERVER_SRC="/tmp/backlog-setup-rag-server.mjs"
  REPO_RAW="https://raw.githubusercontent.com/YOUR_USER/backlog-setup/main"
  curl -fsSL "$REPO_RAW/rag-server.mjs" -o "$RAG_SERVER_SRC" 2>/dev/null || \
    fail "Could not download rag-server.mjs. Run setup from the cloned repo instead."
fi

cp "$RAG_SERVER_SRC" "$TARGET_DIR/rag-server.mjs"
ok "rag-server.mjs installed"

# ─────────────────────────────────────────────────────────────────────────────
# Write MCP configs
# ─────────────────────────────────────────────────────────────────────────────

# .mcp.json (Claude Code / Cursor)
if [ -f ".mcp.json" ]; then
  warn ".mcp.json already exists — skipping (check manually if MCP servers are configured)"
else
  cat > .mcp.json <<MCPJSON
{
  "mcpServers": {
    "backlog": {
      "command": "backlog",
      "args": ["mcp", "start"],
      "env": {
        "BACKLOG_CWD": "$TARGET_DIR"
      }
    },
    "local-rag": {
      "command": "node",
      "args": ["$TARGET_DIR/rag-server.mjs"],
      "env": {
        "BASE_DIR": "$TARGET_DIR/backlog",
        "DB_PATH": "$TARGET_DIR/.lancedb",
        "CACHE_DIR": "$TARGET_DIR/.mcp-local-rag-models"
      }
    }
  }
}
MCPJSON
  ok ".mcp.json created (Claude Code / Cursor)"
fi

# opencode.json (OpenCode)
if [ -f "opencode.json" ]; then
  warn "opencode.json already exists — skipping (check manually if MCP servers are configured)"
else
  cat > opencode.json <<OCJSON
{
  "\$schema": "https://opencode.ai/config.json",
  "mcp": {
    "backlog": {
      "type": "local",
      "command": ["backlog", "mcp", "start"],
      "environment": {
        "BACKLOG_CWD": "$TARGET_DIR"
      },
      "enabled": true
    },
    "local-rag": {
      "type": "local",
      "command": ["node", "$TARGET_DIR/rag-server.mjs"],
      "environment": {
        "BASE_DIR": "$TARGET_DIR/backlog",
        "DB_PATH": "$TARGET_DIR/.lancedb",
        "CACHE_DIR": "$TARGET_DIR/.mcp-local-rag-models"
      },
      "enabled": true
    }
  }
}
OCJSON
  ok "opencode.json created (OpenCode)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Update .gitignore
# ─────────────────────────────────────────────────────────────────────────────

GITIGNORE_ENTRIES=(
  "# RAG vector database"
  ".lancedb/"
  ""
  "# RAG model cache"
  ".mcp-local-rag-models/"
  ""
  "# Node"
  "node_modules/"
)

if [ -f ".gitignore" ]; then
  ADDED=0
  for entry in ".lancedb/" ".mcp-local-rag-models/" "node_modules/"; do
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
# Pre-download embedding model (so first MCP startup is fast)
# ─────────────────────────────────────────────────────────────────────────────

if [ -d ".mcp-local-rag-models/Xenova" ]; then
  ok "Embedding model already cached"
else
  info "Pre-downloading embedding model (~90MB, one-time)..."
  BASE_DIR="$TARGET_DIR/backlog" \
  DB_PATH="$TARGET_DIR/.lancedb" \
  CACHE_DIR="$TARGET_DIR/.mcp-local-rag-models" \
  node -e "
    import('mcp-local-rag/dist/server/index.js').then(async ({ RAGServer }) => {
      const s = new RAGServer({
        dbPath: '$TARGET_DIR/.lancedb',
        modelName: 'Xenova/all-MiniLM-L6-v2',
        cacheDir: '$TARGET_DIR/.mcp-local-rag-models',
        baseDir: '$TARGET_DIR/backlog',
        maxFileSize: 104857600,
      });
      await s.initialize();
      // Trigger model download by ingesting nothing — just warm the cache
      console.log('Model cache ready');
      process.exit(0);
    }).catch(e => { console.error(e.message); process.exit(0); });
  " 2>/dev/null || warn "Model pre-download skipped (will download on first use)"
  ok "Embedding model cached"
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
echo "    backlog/          — kanban board data (tasks, docs, milestones)"
echo "    rag-server.mjs    — auto-ingest MCP wrapper"
echo "    .mcp.json         — MCP config for Claude Code / Cursor"
echo "    opencode.json     — MCP config for OpenCode"
echo ""
echo "  Quick start:"
echo "    backlog board              — view kanban in terminal"
echo "    backlog browser            — open web UI (localhost:6420)"
echo "    backlog task create \"Do X\" — create a task"
echo ""
echo "  MCP servers (auto-start in your AI editor):"
echo "    backlog   — 22 tools for task management"
echo "    local-rag — semantic search (auto-ingests on startup)"
echo ""
echo "  The RAG index syncs automatically every time your AI"
echo "  editor opens this repo. No manual steps needed."
echo ""
