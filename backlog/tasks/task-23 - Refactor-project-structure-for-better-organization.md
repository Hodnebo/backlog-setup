---
id: TASK-23
title: Refactor project structure for better organization
status: To Do
assignee: []
created_date: '2026-03-08 13:36'
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
- [ ] #1 rag-server.mjs is split into ≤6 focused modules in lib/
- [ ] #2 Each extracted module has a single responsibility and exports named functions
- [ ] #3 Test files moved to test/ directory with updated imports
- [ ] #4 setup.sh copies the correct files to target projects (either lib/ dir or re-exported root entry)
- [ ] #5 MCP configs (opencode.json, .mcp.json templates in setup.sh) reference correct entry point
- [ ] #6 All existing tests pass with `node --test` after restructuring
- [ ] #7 perf-test.mjs works from its new location
- [ ] #8 AGENTS.md updated with new paths and module descriptions
- [ ] #9 README.md architecture diagram and file listing updated
- [ ] #10 No functionality changes — pure structural refactor
<!-- AC:END -->
