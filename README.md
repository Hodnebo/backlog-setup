# backlog-setup

One-command AI kanban board with semantic search for any repo.

Combines [Backlog.md](https://github.com/MrLesk/Backlog.md) (markdown kanban + MCP server) with [mcp-local-rag](https://github.com/shinpr/mcp-local-rag) (local vector search + MCP server) and auto-ingestion so your AI editor can manage tasks AND semantically search them.

## What you get

- **Kanban board** stored as markdown files in `backlog/` — works with CLI, web UI, and 22 MCP tools
- **Semantic search** over all tasks via local embeddings (Xenova/all-MiniLM-L6-v2) — no API keys, fully offline
- **Auto-ingestion** — every time your AI editor opens the repo, new/changed tasks are indexed automatically
- **Auto-commit** — task file changes are committed automatically (with git mode detection and batching)
- **MCP configs** for OpenCode, Claude Code, and Cursor — zero manual wiring

## Requirements

- Node.js 18+
- npm

## Quick start

```bash
# Clone this repo (or download setup.sh + lib/)
git clone https://github.com/Hodnebo/backlog-setup.git ~/backlog-setup

# Run in your target project
cd /path/to/your/project
~/backlog-setup/setup.sh
```

Or point it at a directory:

```bash
~/backlog-setup/setup.sh /path/to/your/project
```

To use a per-repo model cache instead of the shared one:

```bash
~/backlog-setup/setup.sh --local-cache /path/to/your/project
```

That's it. Open the project in OpenCode, Claude Code, or Cursor — both MCP servers start automatically.

### Updating existing installations

Re-running `setup.sh` always refreshes the shared install (`~/.local/share/backlog-setup/`), so all projects get updated lib/ code automatically. To also refresh per-project MCP configs and the AGENTS.md workflow section:

```bash
~/backlog-setup/setup.sh --update /path/to/your/project
```

This merges the latest backlog server configs into existing MCP files (preserving other servers) and refreshes the AGENTS.md workflow section. Without `--update`, existing per-project configs are skipped.

Projects that still have a local `lib/` directory are automatically migrated to the shared install on the next run.

## Submodule mode (optional)

By default, `backlog/` is a plain directory tracked by your project's git. For teams or multi-agent workflows where frequent task commits create noise in the main repo, you can isolate backlog history in a separate git repository wired as a submodule.

**With an existing remote repo for backlog:**

```bash
~/backlog-setup/setup.sh --submodule --backlog-remote git@github.com:org/project-backlog.git /path/to/project
```

**Without a remote (local-only, add remote later):**

```bash
~/backlog-setup/setup.sh --submodule /path/to/project
```

This creates a local bare repo at `.backlog-repo.git` as the submodule source. To add a real remote later:

```bash
cd backlog
git remote set-url origin git@github.com:org/project-backlog.git
git push -u origin main
```

Everything else works identically — MCP tools, semantic search, auto-commit all adapt to submodule mode automatically. For conversion from plain directory, cloning, and tradeoffs, see [docs/internals.md](docs/internals.md#submodule-mode-internals).

## What setup.sh does

1. Checks Node.js 18+ and npm are available
2. Installs `backlog.md` globally (if not already present)
3. Runs `backlog init` with MCP integration mode
4. If `--submodule`: wires `backlog/` as a git submodule (handles fresh init, conversion from plain dir, and fresh clones)
5. Installs `lib/` modules, `backlog-commit-hook.sh`, and `mcp-local-rag` to `~/.local/share/backlog-setup/` (shared across all projects)
6. Migrates any existing per-project `lib/` and `backlog-commit-hook.sh` to the shared location
7. Installs the `backlog-semantic-search` skill to `.opencode/skills/`
8. Writes `.mcp.json` (Claude Code / Cursor) and `opencode.json` (OpenCode) — pointing to the shared install
9. Updates `.gitignore` to exclude vector DB, model cache, and node_modules
10. Appends backlog workflow instructions to `AGENTS.md` (with update-safe markers)
11. Migrates any existing per-repo model cache to the shared location (or removes it if shared cache already exists)
12. Pre-downloads the embedding model (~90MB) to `~/.mcp-local-rag-models` (shared across repos, one-time)

Re-running is safe — it refreshes the shared install and skips per-project configs that already exist. Use `--update` to also refresh MCP configs and the AGENTS.md workflow section from the latest templates.

## Files created in your project

```
your-project/
  backlog/                  # Kanban data (tasks, docs, milestones) — commit this
  .mcp.json                 # MCP config for Claude Code / Cursor
  opencode.json             # MCP config for OpenCode
  .opencode/skills/         # AI agent skills (installed by setup.sh)
  .lancedb/                 # Vector database (gitignored)

~/.local/share/backlog-setup/   # Shared install (one copy, all projects)
  lib/                          # Modular RAG server + backlog proxy (8 modules)
  backlog-commit-hook.sh        # Auto-commit hook
  node_modules/                 # mcp-local-rag dependency

~/.mcp-local-rag-models/       # Shared embedding model cache (~97MB, one-time download)
```

## Usage

### CLI

```bash
backlog board                    # Terminal kanban view
backlog browser                  # Web UI at localhost:6420
backlog task create "Do X"       # Create a task
backlog task list                # List all tasks
backlog task view TASK-1         # View a specific task
```

### MCP tools (via your AI editor)

**Backlog MCP proxy** (22 tools): `task_create`, `task_edit`, `task_search`, `task_list`, `task_view`, `task_complete`, `task_archive`, and more. The proxy intercepts 4 workflow guide tools to return corrected guidance that instructs agents to use `backlog_task_complete` for finishing tasks.

**Backlog RAG MCP** (6 tools): `backlog_semantic_search` (vector similarity search), `backlog_rag_ingest_file`, `backlog_rag_ingest_data`, `backlog_rag_delete`, `backlog_rag_list`, `backlog_rag_status`.

### Semantic search vs keyword search

Your AI editor has two ways to search tasks. **Semantic search is the primary method** — it finds results by meaning, synonyms, and conceptual similarity. Keyword search is supplementary for exact ID lookups and structured filtering.

| | `backlog_semantic_search` (primary) | `backlog_task_search` (supplementary) |
|---|---|---|
| **Engine** | Vector embeddings (LanceDB) | Fuzzy keyword (Fuse.js) |
| **Best for** | Conceptual queries, synonyms, natural language | Exact IDs, titles, labels, known keywords |
| **Example** | "tasks about performance" | "TASK-42", "authentication" |
| **When** | Default for all searches | Exact ID lookup or structured filtering only |

The installed `backlog-semantic-search` skill teaches AI agents to prefer semantic search as the default.

### Example AI prompts

- "Search for tasks related to authentication" — uses `backlog_semantic_search` for semantic match
- "Create a task for adding rate limiting to the API" — uses `task_create`
- "Complete TASK-5" — uses `task_complete` to finalize and move to completed folder
- "Find tasks similar to this bug report" — uses `backlog_semantic_search` with natural language

## How it works behind the scenes

**Auto-ingestion** — `~/.local/share/backlog-setup/lib/rag-server.mjs` scans `backlog/` on startup, hashes files, and ingests new/changed ones into a local vector DB. A file watcher keeps everything in sync during long editor sessions.

**Auto-commit** — after each file change, a git commit is scheduled with a 2-second debounce (so multi-field edits produce one commit). The hook script detects your git setup (submodule → commit + push, plain repo → commit only, no git → no-op). Disable with `BACKLOG_AUTO_COMMIT=false`.

**Semantic search** — queries go through local embeddings (Xenova/all-MiniLM-L6-v2) stored in `.lancedb/`. No API keys, fully offline.

**Shared install** — all infrastructure (`lib/`, `backlog-commit-hook.sh`, `node_modules/`) lives in `~/.local/share/backlog-setup/`. MCP configs in each project reference this shared location. Updating backlog-setup once propagates to all projects.

For architecture diagrams, preprocessing details, benchmarks, and exclusion pattern syntax, see [docs/internals.md](docs/internals.md).

## Performance

Tested with 110 tasks: 100% ingestion success, 80% recall, ~956 tokens per query response.

## Architecture

```
AI Editor (OpenCode / Claude Code / Cursor)
  |
  |-- backlog MCP proxy -- ~/.local/share/backlog-setup/lib/backlog-proxy.mjs (stdio)
  |     |-- intercepts 4 workflow guide tools (returns corrected text)
  |     '-- forwards all other tools to upstream backlog MCP
  |           '-- backlog/ directory (markdown task files)
  |
  '-- backlog-rag MCP server -- ~/.local/share/backlog-setup/lib/rag-server.mjs (stdio)
        |-- auto-ingest on startup
        |-- file watcher (live sync + auto-commit trigger)
        |     '-- ~/.local/share/backlog-setup/backlog-commit-hook.sh
        '-- backlog_semantic_search + 5 admin tools
              '-- .lancedb/ (LanceDB vector store)
```

## Customization

### Environment variables

All set automatically by the MCP configs, but can be overridden:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_DIR` | `./backlog` | Directory to scan for files |
| `DB_PATH` | `./.lancedb` | LanceDB storage directory |
| `CACHE_DIR` | `~/.mcp-local-rag-models` | Embedding model cache (shared across repos) |
| `MODEL_NAME` | `Xenova/all-MiniLM-L6-v2` | HuggingFace embedding model |
| `MAX_FILE_SIZE` | `104857600` (100MB) | Max file size for ingestion |
| `EXCLUDE_PATTERNS` | *(none)* | Additional comma-separated exclusion patterns (gitignore-style globs) |
| `BACKLOG_AUTO_COMMIT` | `true` | Set to `false` to disable automatic git commits on task file changes |

### Model cache

The embedding model (~97MB) is stored in `~/.mcp-local-rag-models` and shared across all repos. The first repo you set up downloads it; subsequent repos reuse the cache instantly.

To use a per-project cache instead (e.g., for offline/isolated environments), pass `--local-cache` during setup:

```bash
~/backlog-setup/setup.sh --local-cache
```

This stores the model in `TARGET_DIR/.mcp-local-rag-models` instead of the shared location.

### Exclusion patterns

By default, `.git`, `node_modules`, `.lancedb`, `.mcp-local-rag-models`, `.DS_Store`, and `.opencode` are excluded from indexing. Add custom patterns via `EXCLUDE_PATTERNS` env var or a `.ragignore` file in `BASE_DIR`. See [docs/internals.md](docs/internals.md#exclusion-patterns) for syntax details.

## License

MIT
