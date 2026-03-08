---
id: TASK-6
title: Add file watching for live vector DB sync
status: Done
assignee: []
created_date: '2026-03-07 21:28'
updated_date: '2026-03-08 08:29'
labels:
  - enhancement
  - rag-server
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Currently auto-ingest only runs on MCP server startup. Long editor sessions won't see backlog changes until restart. Add fs.watch on BASE_DIR with debouncing to keep the vector DB in sync continuously as files are created, modified, or deleted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 File changes in BASE_DIR are detected without restarting the MCP server
- [x] #2 Debouncing prevents excessive re-ingestion on rapid saves
- [x] #3 New files are ingested, changed files re-ingested, deleted files removed from vector DB
- [x] #4 Watcher errors are logged non-fatally and do not crash the MCP server
- [x] #5 Existing startup-time sync still runs as before
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added live file watching to rag-server.mjs using native Node.js fs.watch with recursive mode. File changes in BASE_DIR are debounced per-path (300ms) and automatically synced to the LanceDB vector index — new files ingested, changed files re-ingested, deleted files removed. Refactored ingestFile/removeFile into shared helpers used by both startup sync and the watcher. Works natively on macOS and Windows; degrades gracefully on Linux with a logged warning. Updated README with live watching docs and platform support notes.
<!-- SECTION:FINAL_SUMMARY:END -->
