# AGENTS.md — backlog-setup

Setup/tooling repo (not an application). Two source areas: `setup.mjs` (cross-platform Node.js installer), `lib/` (Node.js ESM modules — RAG server wrapping mcp-local-rag, plus MCP proxy for backlog with corrected workflow guides), and `skills/` (installable AI agent skills). No build step, no linter, no CI.

The installers place `lib/`, commit hooks, and `mcp-local-rag` into a shared directory (`~/.local/share/backlog-setup/` on Unix, `%LOCALAPPDATA%\backlog-setup\` on Windows). Per-project files are just `backlog/`, MCP configs, and skills.

## Commands

```bash
node setup.mjs /path/to/target  # Cross-platform installer
BASE_DIR=./backlog DB_PATH=./.lancedb CACHE_DIR=~/.mcp-local-rag-models node lib/rag-server.mjs
node --test test/*.test.mjs     # Run unit tests
```

## Project structure

```
setup.mjs                 # Cross-platform Node.js installer (Windows + macOS + Linux)
lib/
  rag-server.mjs          # Entry point — env config, MCP server, file watcher, auto-commit
  preprocessing.mjs       # Backlog task detection and text preprocessing
  exclusion.mjs           # Directory/file exclusion patterns (glob-to-regex)
  discovery.mjs           # File discovery (recursive scan with extension filtering)
  hashing.mjs             # Content hashing (SHA-256 change detection)
  ingestion.mjs           # File ingestion/removal with retry logic
  workflow-guides.mjs     # Corrected workflow guide text (backlog_task_complete)
  backlog-proxy.mjs       # MCP proxy — intercepts guide tools, forwards the rest
  backlog-commit-hook.mjs # Cross-platform auto-commit hook (Node.js port)
  platform.mjs            # Platform helpers (shared dir, cache dir, path utils)
test/
  preprocessing.test.mjs  # Tests for preprocessing module
  exclusion.test.mjs      # Tests for exclusion module
  guidance.test.mjs       # Policy tests for workflow guidance text
  backlog-proxy.test.mjs  # Tests for MCP proxy module
  platform.test.mjs       # Tests for platform helpers
  perf-test.mjs           # Precision/recall benchmark (50 tasks, 10 queries)
skills/
  backlog-semantic-search.md  # Installed into target projects
```

## Code style

**JavaScript** — ESM via `.mjs` extension (package.json is `"type": "commonjs"`). `node:` protocol imports. 2-space indent, semicolons. `camelCase` locals, `UPPER_SNAKE_CASE` constants. Named function declarations at top level, arrows only inline. All logging to `process.stderr` (stdout reserved for MCP stdio). Top-level await. No TypeScript.

## Critical patterns

1. **Semicolons not periods in assembled text** — `mcp-local-rag`'s SemanticChunker splits on periods via `Intl.Segmenter`, creating sub-50-char fragments that get filtered out. Use `;` separators.
2. **Pad short text to 50+ chars** — repeat context to clear the minimum chunk threshold.
3. **Content hashing** — SHA-256 in `.lancedb/.ingest-hashes.json`. Only re-ingest changed files.
4. **Dual deletion** — try both `source`-based (`backlog://` URI) and `filePath`-based deletion when removing indexed files.
5. **Backlog task detection** — YAML frontmatter with both `id:` and `title:` fields.
6. **Directory exclusion** — `findFiles()` and the file watcher skip paths matching exclusion patterns. Defaults: `.git`, `node_modules`, `.lancedb`, `.mcp-local-rag-models`, `.DS_Store`, `.opencode`. Custom patterns via `EXCLUDE_PATTERNS` env var or `.ragignore` file. Glob-to-regex conversion in `globToRegex()`.
7. **Parameterized modules** — `lib/` modules accept dependencies as function parameters (not module-level env vars). Only `lib/rag-server.mjs` reads env vars and wires everything together.

## Git

Imperative mood commits, no conventional-commits prefix. Gitignored: `.mcp.json`, `opencode.json`, `.lancedb/`, `.mcp-local-rag-models/`, `node_modules/`. Keep `README.md` updated when changing behavior.

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
<!-- BACKLOG_WORKFLOW:END -->
