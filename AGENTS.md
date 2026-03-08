# AGENTS.md — backlog-setup

Setup/tooling repo (not an application). Three source areas: `setup.sh` (bash installer), `lib/` (Node.js ESM modular MCP server wrapping mcp-local-rag), and `skills/` (installable AI agent skills). No build step, no linter, no tests, no CI.

## Commands

```bash
bash -n setup.sh                # Validate shell syntax
./setup.sh /path/to/target      # Run installer against a directory
BASE_DIR=./backlog DB_PATH=./.lancedb CACHE_DIR=~/.mcp-local-rag-models node lib/rag-server.mjs
node --test test/*.test.mjs     # Run unit tests
```

## Project structure

```
setup.sh                  # Bash installer — copies lib/ to target projects
backlog-commit-hook.sh    # Auto-commit hook for task file changes
lib/
  rag-server.mjs          # Entry point — env config, MCP server, file watcher, auto-commit
  preprocessing.mjs       # Backlog task detection and text preprocessing
  exclusion.mjs           # Directory/file exclusion patterns (glob-to-regex)
  discovery.mjs           # File discovery (recursive scan with extension filtering)
  hashing.mjs             # Content hashing (SHA-256 change detection)
  ingestion.mjs           # File ingestion/removal with retry logic
test/
  preprocessing.test.mjs  # Tests for preprocessing module
  exclusion.test.mjs      # Tests for exclusion module
  perf-test.mjs           # Precision/recall benchmark (50 tasks, 10 queries)
skills/
  backlog-semantic-search.md  # Installed into target projects
```

## Code style

**Shell** — `set -euo pipefail`. UPPER_SNAKE_CASE vars, always double-quoted. Sections separated by 77-char `# ────` bars. Idempotent: check-then-act. Log helpers: `info`/`ok`/`warn`/`fail`. Non-fatal errors use `|| true`.

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
