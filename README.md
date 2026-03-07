# backlog-setup

One-command AI kanban board with semantic search for any repo.

Combines [Backlog.md](https://github.com/MrLesk/Backlog.md) (markdown kanban + MCP server) with [mcp-local-rag](https://github.com/shinpr/mcp-local-rag) (local vector search + MCP server) and auto-ingestion so your AI editor can manage tasks AND semantically search them.

## What you get

- **Kanban board** stored as markdown files in `backlog/` — works with CLI, web UI, and 22 MCP tools
- **Semantic search** over all tasks via local embeddings (Xenova/all-MiniLM-L6-v2) — no API keys, fully offline
- **Auto-ingestion** — every time your AI editor opens the repo, new/changed tasks are indexed automatically
- **MCP configs** for OpenCode, Claude Code, and Cursor — zero manual wiring

## Requirements

- Node.js 18+
- npm

## Quick start

```bash
# Clone this repo (or download setup.sh + rag-server.mjs)
git clone https://github.com/Hodnebo/backlog-setup.git ~/backlog-setup

# Run in your target project
cd /path/to/your/project
~/backlog-setup/setup.sh
```

Or point it at a directory:

```bash
~/backlog-setup/setup.sh /path/to/your/project
```

That's it. Open the project in OpenCode, Claude Code, or Cursor — both MCP servers start automatically.

## What setup.sh does

1. Checks Node.js 18+ and npm are available
2. Installs `backlog.md` globally (if not already present)
3. Runs `backlog init` with MCP integration mode
4. Installs `mcp-local-rag` as a local dependency
5. Copies `rag-server.mjs` (auto-ingest wrapper)
6. Writes `.mcp.json` (Claude Code / Cursor) and `opencode.json` (OpenCode)
7. Updates `.gitignore` to exclude vector DB, model cache, and node_modules
8. Pre-downloads the embedding model (~90MB) to `~/.mcp-local-rag-models` (shared across repos, one-time)

Re-running is safe — it skips steps that are already done.

## Files created in your project

```
your-project/
  backlog/              # Kanban data (tasks, docs, milestones) — commit this
  rag-server.mjs        # Auto-ingest MCP wrapper — commit this
  .mcp.json             # MCP config for Claude Code / Cursor
  opencode.json         # MCP config for OpenCode
  .lancedb/             # Vector database (gitignored)
  node_modules/         # mcp-local-rag dependency (gitignored)

~/.mcp-local-rag-models/  # Shared embedding model cache (~97MB, one-time download)
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

**Backlog MCP** (22 tools): `task_create`, `task_edit`, `task_search`, `task_list`, `task_view`, `task_delete`, `task_move`, and more.

**Local-RAG MCP** (6 tools): `query_documents` (semantic search), `ingest_file`, `ingest_data`, `delete_file`, `list_files`, `status`.

### Example AI prompts

- "Search for tasks related to authentication" — uses `query_documents` for semantic match
- "Create a task for adding rate limiting to the API" — uses `task_create`
- "Move TASK-5 to Done" — uses `task_edit` to change status
- "Find tasks similar to this bug report" — uses `query_documents` with natural language

## How auto-ingestion works

`rag-server.mjs` wraps `mcp-local-rag` and adds startup-time sync:

1. Scans `backlog/` recursively for `.md`, `.txt`, `.pdf`, `.docx` files
2. Computes SHA-256 content hashes and compares against `.lancedb/.ingest-hashes.json`
3. **Preprocesses backlog tasks** — strips YAML noise, HTML markers, and assembles clean embedding-friendly text
4. Ingests only new or changed files into LanceDB
5. Removes deleted files from the vector index
6. Starts the real MCP server over stdio

Cold start (model loading): ~15s. Warm start (no changes): instant. One new file: ~5s.

### Backlog task preprocessing

Raw backlog task files contain YAML frontmatter, dates, HTML section markers, and other noise that degrades embedding quality. The auto-ingest wrapper detects backlog tasks (files with `id:` and `title:` in YAML frontmatter) and preprocesses them:

- Extracts: title, labels, priority, description
- Strips: dates, ordinals, empty arrays, HTML markers (`<!-- SECTION:... -->`)
- Assembles: `"title; labels: x, y; priority: z; description text"`
- Uses **semicolons** as separators (not periods) — this is critical because `mcp-local-rag`'s `SemanticChunker` uses `Intl.Segmenter` which splits on periods, creating tiny sentences that fall below the 50-char minimum chunk threshold
- Pads short texts to 50+ characters to avoid being filtered out

Non-backlog files (`.txt`, `.pdf`, `.docx`, regular `.md`) are ingested raw.

## Performance

Tested with 110 tasks across 10 domains (auth, database, API, frontend, DevOps, monitoring, security, testing, documentation, performance):

| Metric | Result |
|--------|--------|
| Ingestion success | **110/110** (100%) |
| Semantic query accuracy | **10/10** queries passed |
| Average precision | 68.5% |
| Average recall | **80.0%** |
| Average response size | ~956 tokens per query |

Each `query_documents` call returns relevant results in ~956 tokens — well within context-friendly bounds for AI editors.

## Architecture

```
AI Editor (OpenCode / Claude Code / Cursor)
  │
  ├─► backlog MCP server (stdio)
  │     └─► backlog/ directory (markdown task files)
  │
  └─► rag-server.mjs (stdio)
        ├─► auto-ingest on startup
        └─► mcp-local-rag MCP server
              └─► .lancedb/ (LanceDB vector store)
```

Both servers communicate over stdio — no ports, no daemons, no background processes. They start when your editor opens the project and stop when it closes.

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

### Model cache

The embedding model (~97MB) is stored in `~/.mcp-local-rag-models` and shared across all repos. The first repo you set up downloads it; subsequent repos reuse the cache instantly.

To use a per-project cache instead, override `CACHE_DIR` in your MCP configs:

```json
"CACHE_DIR": "/path/to/your/project/.mcp-local-rag-models"
```

## License

MIT
