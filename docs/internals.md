# Internals

Deep-dive into how backlog-setup works under the hood. For setup and usage, see the [README](../README.md).

## Architecture

```
AI Editor (OpenCode / Claude Code / Cursor)
  |
  |-- backlog MCP server (stdio)
  |     '-- backlog/ directory (markdown task files)
  |
  '-- backlog-rag MCP server -- rag-server.mjs (stdio)
        |-- auto-ingest on startup
        |-- file watcher (live sync + auto-commit trigger)
        |     '-- backlog-commit-hook.mjs (cross-platform)
        '-- backlog_semantic_search + 5 admin tools
              '-- .lancedb/ (LanceDB vector store)
```

Both servers communicate over stdio — no ports, no daemons, no background processes. They start when your editor opens the project and stop when it closes.

## Auto-ingestion pipeline

`rag-server.mjs` wraps `mcp-local-rag` and adds startup-time sync plus live file watching:

1. Scans `backlog/` recursively for `.md`, `.txt`, `.pdf`, `.docx` files (skipping excluded directories and files)
2. Computes SHA-256 content hashes and compares against `.lancedb/.ingest-hashes.json`
3. **Preprocesses backlog tasks** — strips YAML noise, HTML markers, and assembles clean embedding-friendly text
4. Ingests only new or changed files into LanceDB
5. Removes deleted files from the vector index
6. Starts a custom MCP server with backlog-named tools (`backlog_semantic_search`, etc.) over stdio
7. **Starts a file watcher** on `BASE_DIR` — file changes are detected, debounced (300ms), and synced to the vector DB automatically
8. **Triggers auto-commit** — after each successful ingest/remove, schedules a git commit (2s debounce) via `backlog-commit-hook.mjs`

Cold start (model loading): ~15s. Warm start (no changes): instant. One new file: ~5s.

### Live file watching

After startup, `rag-server.mjs` watches `BASE_DIR` for file changes using Node.js `fs.watch` with recursive mode. This means long editor sessions stay in sync without restarting the MCP server.

- **New files** are ingested automatically
- **Changed files** are re-ingested (hash-compared to skip unchanged content)
- **Deleted files** are removed from the vector index
- Events are **debounced per-file** (300ms) to handle rapid saves and editor atomic-write patterns
- Watcher errors are logged but never crash the server — worst case, you fall back to startup-only sync

**Platform support**: Recursive file watching works natively on **macOS** and **Windows**. On **Linux**, `fs.watch` recursive support is limited in some Node.js versions — if unavailable, the server logs a warning and continues with startup-only sync.

### Backlog task preprocessing

Raw backlog task files contain YAML frontmatter, dates, HTML section markers, and other noise that degrades embedding quality. The auto-ingest wrapper detects backlog tasks (files with `id:` and `title:` in YAML frontmatter) and preprocesses them:

- Extracts: title, labels, priority, description
- Strips: dates, ordinals, empty arrays, HTML markers (`<!-- SECTION:... -->`)
- Assembles: `"title; labels: x, y; priority: z; description text"`
- Uses **semicolons** as separators (not periods) — this is critical because `mcp-local-rag`'s `SemanticChunker` uses `Intl.Segmenter` which splits on periods, creating tiny sentences that fall below the 50-char minimum chunk threshold
- Pads short texts to 50+ characters to avoid being filtered out

Non-backlog files (`.txt`, `.pdf`, `.docx`, regular `.md`) are ingested raw.

## Auto-commit details

When the file watcher detects a task file change (after ingestion/removal), it schedules an automatic git commit. Task creates, edits, status changes, completions, and archives are committed without agents needing to think about it.

### Commit batching

Multiple file changes within a **2-second window** are batched into a single commit. This handles multi-field edits (e.g., changing status + adding a note) that produce rapid sequential file events.

### Git mode detection

The commit hook (`lib/backlog-commit-hook.mjs`) detects how `backlog/` is set up and commits accordingly:

| Git mode | Detection | Behavior |
|----------|-----------|----------|
| **Submodule** | `backlog/.git` exists as file (gitdir pointer) | `git add -A` → commit → `pull --rebase` → push |
| **Plain repo** | Parent directory is a git repo | `git add backlog/` → commit (no push) |
| **No git** | No git repo detected | No-op (logs skip message) |

In submodule mode, the hook also pushes after committing. Push failures are logged as warnings but never crash the server.

### Commit messages

Messages are auto-generated from the operation context:

- `backlog: update TASK-21` — single task edited
- `backlog: update TASK-5, TASK-12` — multiple tasks in one batch
- `backlog: update tasks` — fallback when task ID can't be extracted

All commits use `--no-verify` to skip pre-commit hooks that target source code.

## Exclusion patterns

The recursive file scanner and live file watcher skip directories and files matching exclusion patterns. This prevents indexing `.git`, `node_modules`, and other irrelevant content when `BASE_DIR` is broader than `backlog/`.

**Default exclusions** (always active):

- `.git`
- `node_modules`
- `.lancedb`
- `.mcp-local-rag-models`
- `.DS_Store`
- `.opencode`

**Custom exclusions** — two methods:

1. **Environment variable** — set `EXCLUDE_PATTERNS` with comma-separated gitignore-style globs:

   ```bash
   EXCLUDE_PATTERNS="dist,*.log,build/**" node rag-server.mjs
   ```

2. **`.ragignore` file** — create a `.ragignore` file in `BASE_DIR` with one pattern per line:

   ```
   # Ignore build artifacts
   dist
   build/**

   # Ignore log files
   *.log

   # Ignore a specific subdirectory from root
   /vendor
   ```

**Supported glob syntax**:

| Pattern | Matches |
|---------|---------|
| `foo` | Any path segment named `foo` (e.g., `a/foo/b`, `foo`) |
| `*.log` | Files ending in `.log` anywhere |
| `build/**` | Everything under any `build/` directory |
| `/vendor` | `vendor` only at the root of `BASE_DIR` |
| `temp/` | Directories named `temp` (trailing slash stripped, same as `temp`) |

## Performance benchmarks

Tested with 110 tasks across 10 domains (auth, database, API, frontend, DevOps, monitoring, security, testing, documentation, performance):

| Metric | Result |
|--------|--------|
| Ingestion success | **110/110** (100%) |
| Semantic query accuracy | **10/10** queries passed |
| Average precision | 68.5% |
| Average recall | **80.0%** |
| Average response size | ~956 tokens per query |

Each `backlog_semantic_search` call returns relevant results in ~956 tokens — well within context-friendly bounds for AI editors.

## Submodule mode internals

### How it works

- Task files live in `backlog/` exactly as before — all MCP tools, semantic search, and skills work identically
- `backlog/` is a git submodule pointing to a separate repository
- Task commits (creates, edits, status changes) happen inside the submodule repo
- The parent project only tracks a submodule pointer, not individual task files
- The parent pointer updates only when you explicitly commit it (e.g. at milestone boundaries)

### Tradeoffs

| | Plain directory (default) | Submodule mode |
|---|---|---|
| **Setup** | Zero config | Requires `--submodule` flag |
| **Commit workflow** | `git add backlog/ && git commit` | `cd backlog && git add -A && git commit && git push` |
| **Project history** | Task changes mixed with code changes | Task changes isolated in separate repo |
| **Merge conflicts** | Possible on task files during rebases | Isolated to backlog repo |
| **Best for** | Solo developers, small teams | Teams, multi-agent workflows, noisy backlogs |

### Converting and cloning

**Converting an existing plain backlog/ to submodule:**

If you already ran setup without `--submodule` and want to convert, just re-run with the flag:

```bash
npx backlog-setup --submodule --backlog-remote <url> /path/to/project
```

The script detects the existing `backlog/` directory, converts it to a submodule, and preserves all task files.

**Cloning a project that uses submodule mode:**

```bash
git clone --recursive <project-url>
# or if already cloned:
git submodule update --init
```

`npx backlog-setup --submodule` also handles this automatically — if `.gitmodules` references backlog but it isn't initialized, it runs `git submodule update --init`.
