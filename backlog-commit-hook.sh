#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# backlog-commit-hook.sh — Auto-commit backlog file changes
#
# Called by the RAG server file watcher after backlog files are created,
# modified, or deleted. Detects git mode and commits accordingly:
#
#   - Submodule mode: git add -A → commit → pull --rebase → push (in submodule)
#   - Plain repo mode: git add backlog/ → commit (no push)
#   - No git: no-op
#
# Usage:
#   backlog-commit-hook.sh <operation_description>
#
# Arguments:
#   operation_description  — human-readable summary for the commit message
#                            (e.g. "update task TASK-21 status to Done")
#
# Environment:
#   BACKLOG_AUTO_COMMIT  — set to "false" to disable (default: true)
#   BACKLOG_DIR          — backlog directory path (required)
# ─────────────────────────────────────────────────────────────────────────────

# ── Logging helpers ──────────────────────────────────────────────────────────

log()  { echo "[backlog-commit] $*" >&2; }
warn() { echo "[backlog-commit] WARNING: $*" >&2; }

# ── Early exit: disabled via env var ─────────────────────────────────────────

if [ "${BACKLOG_AUTO_COMMIT:-true}" = "false" ]; then
  exit 0
fi

# ── Validate arguments ──────────────────────────────────────────────────────

if [ $# -lt 1 ]; then
  warn "usage: backlog-commit-hook.sh <operation_description>"
  exit 1
fi

OPERATION="$1"

if [ -z "${BACKLOG_DIR:-}" ]; then
  warn "BACKLOG_DIR not set — skipping commit"
  exit 1
fi

if [ ! -d "$BACKLOG_DIR" ]; then
  warn "BACKLOG_DIR does not exist: $BACKLOG_DIR"
  exit 1
fi

# ── Check if git is available ────────────────────────────────────────────────

if ! command -v git &>/dev/null; then
  exit 0
fi

# ── Detect git mode ─────────────────────────────────────────────────────────

# Submodule mode: backlog/ has its own .git (file pointing to parent's
# .git/modules/backlog, or a standalone .git directory)
is_submodule() {
  [ -f "$BACKLOG_DIR/.git" ] || {
    [ -d "$BACKLOG_DIR/.git" ] && \
    git -C "$BACKLOG_DIR" rev-parse --is-inside-work-tree &>/dev/null && \
    [ "$(git -C "$BACKLOG_DIR" rev-parse --show-toplevel 2>/dev/null)" = "$BACKLOG_DIR" ]
  }
}

is_plain_repo() {
  local parent_dir
  parent_dir="$(dirname "$BACKLOG_DIR")"
  git -C "$parent_dir" rev-parse --is-inside-work-tree &>/dev/null 2>&1
}

# ── Commit logic ────────────────────────────────────────────────────────────

commit_submodule() {
  log "submodule mode: committing in $BACKLOG_DIR"

  git -C "$BACKLOG_DIR" add -A 2>/dev/null || true

  if git -C "$BACKLOG_DIR" diff --cached --quiet 2>/dev/null; then
    log "nothing to commit"
    return 0
  fi

  git -C "$BACKLOG_DIR" commit --no-verify -m "backlog: $OPERATION" >/dev/null 2>&1 || {
    warn "commit failed in submodule"
    return 0
  }

  if git -C "$BACKLOG_DIR" remote get-url origin &>/dev/null 2>&1; then
    local branch
    branch="$(git -C "$BACKLOG_DIR" branch --show-current 2>/dev/null || echo "main")"

    git -C "$BACKLOG_DIR" pull --rebase origin "$branch" >/dev/null 2>&1 || {
      warn "pull --rebase failed — commit is local only"
      return 0
    }

    git -C "$BACKLOG_DIR" push origin "$branch" >/dev/null 2>&1 || {
      warn "push failed — commit is local, push manually later"
      return 0
    }

    log "committed and pushed to $branch"
  else
    log "committed (no remote configured)"
  fi
}

commit_plain_repo() {
  local parent_dir
  parent_dir="$(dirname "$BACKLOG_DIR")"
  local git_root
  git_root="$(git -C "$parent_dir" rev-parse --show-toplevel 2>/dev/null)"

  log "plain repo mode: committing in $git_root"

  local backlog_rel
  backlog_rel="${BACKLOG_DIR#"$git_root"/}"

  git -C "$git_root" add -- "$backlog_rel" 2>/dev/null || true

  if git -C "$git_root" diff --cached --quiet 2>/dev/null; then
    log "nothing to commit"
    return 0
  fi

  git -C "$git_root" commit --no-verify -m "backlog: $OPERATION" >/dev/null 2>&1 || {
    warn "commit failed"
    return 0
  }

  log "committed"
}

# ── Main ─────────────────────────────────────────────────────────────────────

if is_submodule; then
  commit_submodule
elif is_plain_repo; then
  commit_plain_repo
else
  exit 0
fi
