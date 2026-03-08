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

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
fail()  { echo -e "${RED}[error]${NC} $*"; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────────────────────────────

LOCAL_CACHE=false
SUBMODULE_MODE=false
BACKLOG_REMOTE=""
TARGET_DIR=""

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
  --help                      Show this help message and exit.
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local-cache)
      LOCAL_CACHE=true
      shift
      ;;
    --submodule)
      SUBMODULE_MODE=true
      shift
      ;;
    --backlog-remote)
      [[ -z "${2:-}" ]] && fail "--backlog-remote requires a URL argument"
      BACKLOG_REMOTE="$2"
      shift 2
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

TARGET_DIR="${TARGET_DIR:-$(pwd)}"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

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

    # Turn backlog/ into its own git repo
    git -C "$BACKLOG_DIR" init -q
    git -C "$BACKLOG_DIR" add -A
    git -C "$BACKLOG_DIR" commit -q -m "Initial backlog content"

    if [ -n "$BACKLOG_REMOTE" ]; then
      git -C "$BACKLOG_DIR" remote add origin "$BACKLOG_REMOTE"
      git -C "$BACKLOG_DIR" push -u origin "$(git -C "$BACKLOG_DIR" branch --show-current)" 2>/dev/null || \
        warn "Could not push to $BACKLOG_REMOTE — push manually later"
    fi

    # Remove backlog/ from the parent repo tracking and re-add as submodule
    git rm -r --cached backlog >/dev/null 2>&1 || true
    rm -rf "$BACKLOG_DIR/.git"

    if [ -n "$BACKLOG_REMOTE" ]; then
      git submodule add "$BACKLOG_REMOTE" backlog
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
REPO_RAW="https://raw.githubusercontent.com/Hodnebo/backlog-setup/main"

if [ ! -f "$RAG_SERVER_SRC" ]; then
  RAG_SERVER_SRC="/tmp/backlog-setup-rag-server.mjs"
  curl -fsSL "$REPO_RAW/rag-server.mjs" -o "$RAG_SERVER_SRC" 2>/dev/null || \
    fail "Could not download rag-server.mjs. Run setup from the cloned repo instead."
fi

cp "$RAG_SERVER_SRC" "$TARGET_DIR/rag-server.mjs"
ok "rag-server.mjs installed"

# ─────────────────────────────────────────────────────────────────────────────
# Copy backlog-commit-hook.sh (auto-commit after task operations)
# ─────────────────────────────────────────────────────────────────────────────

COMMIT_HOOK_SRC="$SCRIPT_DIR/backlog-commit-hook.sh"

if [ ! -f "$COMMIT_HOOK_SRC" ]; then
  COMMIT_HOOK_SRC="/tmp/backlog-setup-commit-hook.sh"
  curl -fsSL "$REPO_RAW/backlog-commit-hook.sh" -o "$COMMIT_HOOK_SRC" 2>/dev/null || \
    warn "Could not download backlog-commit-hook.sh — auto-commit disabled"
fi

if [ -f "$COMMIT_HOOK_SRC" ]; then
  cp "$COMMIT_HOOK_SRC" "$TARGET_DIR/backlog-commit-hook.sh"
  chmod +x "$TARGET_DIR/backlog-commit-hook.sh"
  ok "backlog-commit-hook.sh installed"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Install backlog semantic search skill (OpenCode)
# ─────────────────────────────────────────────────────────────────────────────

SKILL_SRC="$SCRIPT_DIR/skills/backlog-semantic-search.md"
SKILL_DEST="$TARGET_DIR/.opencode/skills/backlog-semantic-search.md"

if [ -f "$SKILL_SRC" ]; then
  mkdir -p "$TARGET_DIR/.opencode/skills"
  cp "$SKILL_SRC" "$SKILL_DEST"
  ok "Backlog semantic search skill installed (.opencode/skills/)"
else
  warn "Skill file not found at $SKILL_SRC — skipping skill install"
fi

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
    "backlog-rag": {
      "command": "node",
      "args": ["$TARGET_DIR/rag-server.mjs"],
      "env": {
        "BASE_DIR": "$TARGET_DIR/backlog",
        "DB_PATH": "$TARGET_DIR/.lancedb",
        "CACHE_DIR": "$CACHE_DIR_VALUE"
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
    "backlog-rag": {
      "type": "local",
      "command": ["node", "$TARGET_DIR/rag-server.mjs"],
      "environment": {
        "BASE_DIR": "$TARGET_DIR/backlog",
        "DB_PATH": "$TARGET_DIR/.lancedb",
        "CACHE_DIR": "$CACHE_DIR_VALUE"
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
  ""
  "# Backlog submodule bare repo (if using --submodule without remote)"
  ".backlog-repo.git"
)

if [ -f ".gitignore" ]; then
  ADDED=0
  for entry in ".lancedb/" ".mcp-local-rag-models/" "node_modules/" ".backlog-repo.git"; do
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

AGENTS_MARKER="## Backlog Workflow"

if [ -f "AGENTS.md" ] && grep -qF "$AGENTS_MARKER" AGENTS.md; then
  ok "AGENTS.md already has backlog workflow section"
else
  cat >> AGENTS.md <<'AGENTSEOF'

## Backlog Workflow

Before starting any work:

1. Run `backlog_task_list` to see current tasks and their statuses
2. Check if the work you are about to do is already tracked as a task

While working:

- If no task exists for your work, create one with `backlog_task_create` and set status to "In Progress"
- If a task exists, move it to "In Progress" with `backlog_task_edit`
- Break large efforts into subtasks

After completing work:

- Mark the task "Done" with `backlog_task_edit`
- Fill in the `finalSummary` with what changed and why

Use `backlog_semantic_search` for natural-language task discovery ("what needs performance work?") and `backlog_task_search` for exact lookups ("TASK-12", "authentication").
AGENTSEOF

  if [ "$SUBMODULE_MODE" = true ]; then
    cat >> AGENTS.md <<'AGENTSEOF'

### Committing backlog changes (submodule mode)

The `backlog/` directory is a git submodule with its own repository. Commit task changes inside the submodule — not in the parent repo.

```bash
cd backlog
git pull --rebase origin main
git add -A
git commit -m "backlog: <short summary of what changed>"
git push origin main
cd ..
```

**When to commit:**
- After creating or editing tasks as part of planning (not after every single field edit — batch related changes)
- After moving tasks to a new status (e.g. marking tasks Done at the end of a work session)
- After writing a finalSummary on a completed task

**When NOT to commit backlog separately:**
- Mid-implementation — finish your current work first, then commit backlog changes

**Updating the submodule pointer in the parent repo:**
Only update the parent repo's submodule reference at meaningful boundaries (e.g. end of a sprint, milestone, or when explicitly asked). This keeps the parent repo history clean.

```bash
git add backlog
git commit -m "Update backlog submodule pointer"
```
AGENTSEOF
  else
    cat >> AGENTS.md <<'AGENTSEOF'

### Committing backlog changes

After completing a batch of backlog operations (creating tasks, editing descriptions, moving status), commit the changed files in `backlog/`:

```bash
git add backlog/
git commit -m "backlog: <short summary of what changed>"
```

**When to commit:**
- After creating or editing tasks as part of planning (not after every single field edit — batch related changes)
- After moving tasks to a new status (e.g. marking tasks Done at the end of a work session)
- After writing a finalSummary on a completed task

**When NOT to commit backlog separately:**
- If you are about to commit implementation code that includes backlog changes — combine them into one commit
- Mid-implementation — finish your current work first, then commit backlog changes

Keep backlog commits small and descriptive. Examples:
- `backlog: create tasks for auth module`
- `backlog: move TASK-5 to Done, add final summary`
- `backlog: update TASK-3 description and acceptance criteria`
AGENTSEOF
  fi

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
  " 2>/dev/null || warn "Model pre-download skipped (will download on first use)"
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
echo "    rag-server.mjs           — auto-ingest MCP wrapper"
echo "    backlog-commit-hook.sh   — auto-commit after task operations"
echo "    .mcp.json                — MCP config for Claude Code / Cursor"
echo "    opencode.json            — MCP config for OpenCode"
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
echo ""
echo "  Installed skill:"
echo "    .opencode/skills/backlog-semantic-search.md"
echo ""
echo "  The RAG index syncs automatically every time your AI"
echo "  editor opens this repo. No manual steps needed."
echo ""
echo "  Auto-commit: task changes are committed automatically."
echo "  Disable with: BACKLOG_AUTO_COMMIT=false"
echo ""
