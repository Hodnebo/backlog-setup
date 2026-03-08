---
id: TASK-22
title: Auto-commit hook for backlog file changes
status: Done
assignee: []
created_date: '2026-03-08 12:12'
updated_date: '2026-03-08 12:45'
labels:
  - enhancement
  - setup
  - git
dependencies:
  - TASK-20
  - TASK-21
references:
  - setup.sh
  - rag-server.mjs
  - TASK-20
  - TASK-21
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After a backlog tool operation (task create, edit, status change, complete, archive), the changed file sits uncommitted. Agents shouldn't have to think about committing backlog changes — it should happen automatically.

Add a post-operation hook that fires after each successful backlog file write. The hook auto-commits and (in submodule mode) pushes the change. Uses `--no-verify` on commits to skip pre-commit hooks that target source code, not markdown task files.

**Behavior by git mode:**
- **Submodule mode**: `git add <file>` → `git commit --no-verify -m "<message>"` → `git pull --rebase` → `git push` (all within the submodule)
- **Plain repo mode**: `git add <file>` → `git commit --no-verify -m "<message>"` (no push — stays on local main)
- **No git**: no-op, silent

**Integration point:** The hook is a shell script invoked by the MCP server or backlog tool layer after a successful file write. The calling tool passes the changed file path and a human-readable operation description for the commit message.

**Disable via:** `BACKLOG_AUTO_COMMIT=false` env var for users who prefer manual commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A post-operation hook script (e.g. backlog-commit-hook.sh) is created and installed by setup.sh
- [x] #2 The hook is called automatically after successful backlog tool operations (create, edit, complete, archive, move)
- [x] #3 Hook detects git mode: submodule → commit + pull --rebase + push; plain repo → commit only; no git → no-op
- [x] #4 All commits use --no-verify to skip pre-commit hooks
- [x] #5 Commit messages are descriptive and auto-generated from the operation (e.g. 'update task TASK-21 status to Done')
- [x] #6 Hook handles push failures gracefully (log warning, don't crash the MCP tool)
- [x] #7 Hook is configurable: can be disabled via env var (e.g. BACKLOG_AUTO_COMMIT=false)
- [x] #8 setup.sh installs the hook script and configures the MCP server or backlog tools to invoke it
- [x] #9 Works correctly for batch operations (e.g. backlog_task_edit changing multiple fields = one commit, not N commits)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Auto-commit hook for backlog file changes

### New file: `backlog-commit-hook.sh`
Shell script that detects git mode (submodule/plain/no-git) and commits accordingly. Submodule mode does `git add -A` → commit → `pull --rebase` → push. Plain repo mode does `git add backlog/` → commit (no push). All commits use `--no-verify`. Push failures warn but never crash. Disabled via `BACKLOG_AUTO_COMMIT=false`.

### Modified: `rag-server.mjs`
- Added `scheduleCommit()` with 2-second debounce to batch rapid file events into single commits
- Added `buildOperationDescription()` to extract task IDs from filenames for descriptive commit messages (e.g. "backlog: update TASK-21")
- Integrated into `handleFileEvent()` — auto-commit triggers after every successful ingest/remove in the file watcher

### Modified: `setup.sh`
- Copies `backlog-commit-hook.sh` to target project with `chmod +x`
- Curl fallback for pipe installs
- Updated "Done" summary output

### Modified: `README.md`
- Added "Auto-commit" to "What you get" bullets
- Added step 7 to "What setup.sh does" (hook script installation)
- Added `backlog-commit-hook.sh` to "Files created" tree
- Added step 8 to "How auto-ingestion works" (auto-commit trigger)
- Added full "How auto-commit works" section (batching, git modes, commit messages, disabling)
- Updated architecture diagram with file watcher + hook
- Added `BACKLOG_AUTO_COMMIT` to environment variables table

### All 9 acceptance criteria met:
1. ✅ Hook script created and installed by setup.sh
2. ✅ Hook called automatically after backlog tool operations (via file watcher)
3. ✅ Hook detects git mode correctly (submodule/plain/none)
4. ✅ All commits use --no-verify
5. ✅ Commit messages are descriptive and auto-generated
6. ✅ Push failures handled gracefully
7. ✅ Configurable via BACKLOG_AUTO_COMMIT=false
8. ✅ setup.sh installs the hook script
9. ✅ Batch operations produce one commit (2s debounce)
<!-- SECTION:FINAL_SUMMARY:END -->
