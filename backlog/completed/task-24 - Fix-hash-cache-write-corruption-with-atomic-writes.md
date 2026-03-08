---
id: TASK-24
title: Fix hash cache write corruption with atomic writes
status: Done
assignee: []
created_date: '2026-03-08 14:32'
updated_date: '2026-03-08 15:42'
labels:
  - bug
  - rag-server
dependencies: []
references:
  - lib/hashing.mjs
  - lib/ingestion.mjs
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
saveHashCache() in lib/hashing.mjs uses writeFileSync() to .lancedb/.ingest-hashes.json with no atomic write pattern. When the file watcher fires on multiple files simultaneously, concurrent async handlers in ingestion.mjs all call saveHashCache() — a crash or partial write mid-operation corrupts the JSON file. On next startup, the corrupted cache causes a full re-ingestion of all files.

Fix: write to a temp file in the same directory, then rename() (atomic on POSIX). This prevents partial writes from corrupting the cache.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hash cache writes use temp file + rename pattern (atomic on POSIX)
- [x] #2 Corrupted or missing hash cache file is handled gracefully on load (fresh start, not crash)
- [x] #3 Existing tests still pass
- [x] #4 No new dependencies added
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`saveHashCache()` in `lib/hashing.mjs` now writes to a `.tmp` file then uses `renameSync()` to atomically replace the real cache — prevents corruption from concurrent writes or mid-write crashes. `loadHashCache()` already handled corrupted files gracefully (try/catch → `{}`). No new dependencies. All 65 tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
