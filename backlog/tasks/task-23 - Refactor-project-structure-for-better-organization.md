---
id: TASK-23
title: Refactor project structure for better organization
status: Done
assignee: []
created_date: '2026-03-08 13:36'
updated_date: '2026-03-08 14:16'
labels:
  - refactor
  - DX
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The project has grown organically and all source files sit flat in the root directory. `rag-server.mjs` is a 602-line monolith mixing MCP server setup, file discovery, preprocessing, content hashing, file watching, auto-commit triggering, and exclusion pattern logic. Test files and the perf test also live at root level with no separation.

### Current root layout
```
setup.sh                          # 614 lines — bash installer
rag-server.mjs                    # 602 lines — monolithic MCP server (does everything)
backlog-commit-hook.sh            # 151 lines — git auto-commit hook
perf-test.mjs                     # 396 lines — performance benchmark
rag-utils.preprocessing.test.mjs  # 240 lines — preprocessing unit tests
rag-utils.exclusion.test.mjs      # 281 lines — exclusion logic unit tests
skills/                           # 1 skill file
docs/                             # 1 doc file
```

### Proposed structure
```
setup.sh                     # stays at root (entry point for users)
backlog-commit-hook.sh       # stays at root (copied to target projects)
lib/
  rag-server.mjs             # slim MCP server entry — wiring only
  preprocessing.mjs          # task text preprocessing (extractFrontmatter, preprocessContent)
  exclusion.mjs              # glob-to-regex, exclusion pattern loading, shouldExclude
  discovery.mjs              # findFiles, file scanning, watcher setup
  hashing.mjs                # SHA-256 content hashing, hash store read/write
  ingestion.mjs              # ingest/delete logic, batch operations
skills/
  backlog-semantic-search.md
docs/
  internals.md
test/
  preprocessing.test.mjs
  exclusion.test.mjs
  perf-test.mjs
```

### Key constraints
- `setup.sh` copies `rag-server.mjs` into target projects — the copy path and MCP config (`opencode.json`, `.mcp.json`) must be updated to `lib/rag-server.mjs` or the entry point must remain importable from root
- All imports use `node:` protocol and ESM — extracted modules must use `.mjs` extension
- No TypeScript, no build step — keep it simple
- `AGENTS.md` must be updated to reflect new paths
- `README.md` architecture diagram and file listing must be updated
- Test imports must point to new `lib/` paths
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 rag-server.mjs is split into ≤6 focused modules in lib/
- [x] #2 Each extracted module has a single responsibility and exports named functions
- [x] #3 Test files moved to test/ directory with updated imports
- [x] #4 setup.sh copies the correct files to target projects (either lib/ dir or re-exported root entry)
- [x] #5 MCP configs (opencode.json, .mcp.json templates in setup.sh) reference correct entry point
- [x] #6 All existing tests pass with `node --test` after restructuring
- [x] #7 perf-test.mjs works from its new location
- [x] #8 AGENTS.md updated with new paths and module descriptions
- [x] #9 README.md architecture diagram and file listing updated
- [x] #10 No functionality changes — pure structural refactor
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Split 602-line monolithic `rag-server.mjs` into 6 focused modules under `lib/`: `preprocessing.mjs`, `exclusion.mjs`, `discovery.mjs`, `hashing.mjs`, `ingestion.mjs`, and a slim `rag-server.mjs` entry point. Moved 3 test files to `test/` with updated imports. Updated `setup.sh` to copy all lib files (including curl fallback), updated MCP config templates to reference `lib/rag-server.mjs`, and updated `AGENTS.md`, `README.md`, and `package.json` to reflect new structure. Deleted 5 old root-level files. All 65 tests pass, `bash -n setup.sh` validates clean. Commits: `53b1b05` (refactor), `6bf6c58` (backlog task).
<!-- SECTION:FINAL_SUMMARY:END -->
