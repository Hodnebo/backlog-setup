---
id: TASK-7
title: Add error recovery and retry logic for ingestion
status: Done
assignee: []
created_date: '2026-03-07 21:28'
updated_date: '2026-03-08 08:32'
labels:
  - enhancement
  - rag-server
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Failed ingestions are logged but never retried. Add simple retry logic (1-2 retries with backoff) for transient failures during file ingestion and deletion. Covers disk I/O errors, model loading hiccups, and partial failures during startup sync.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Failed ingestions are retried up to 2 times with exponential backoff
- [x] #2 Failed deletions are retried up to 2 times with exponential backoff
- [x] #3 Retry attempts are logged to stderr with attempt number
- [x] #4 Permanently failed files are collected and reported in the final summary
- [x] #5 Retries do not block other file processing (fail-fast per file)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added error recovery with retry logic to `rag-server.mjs`.\n\n**Changes:**\n- Added `withRetry(fn, label)` utility — retries up to 2 times with exponential backoff (500ms, 1000ms), logs each attempt to stderr\n- Wrapped all `ingestFile()` and `removeFile()` calls in both `autoIngest` and the file watcher with `withRetry`\n- Permanently failed files are collected into a `failedFiles` array and reported in the final startup summary\n- Each file still fails independently (fail-fast per file) — one bad file doesn't block others\n- Constants: `MAX_RETRIES = 2`, `RETRY_BASE_MS = 500`\n\n**Files changed:** `rag-server.mjs`
<!-- SECTION:FINAL_SUMMARY:END -->
