---
id: TASK-28
title: Exclude completed/archived tasks from semantic search
status: In Progress
assignee: []
created_date: '2026-03-08 15:42'
updated_date: '2026-03-08 16:19'
labels:
  - rag-server
  - skill
  - enhancement
dependencies: []
references:
  - lib/exclusion.mjs
  - lib/rag-server.mjs
  - skills/backlog-semantic-search.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Completed and archived tasks pollute semantic search results. When a task is marked Done, agents typically use `backlog_task_edit(status="Done")` which leaves the file in `backlog/tasks/` — it stays indexed with equal weight to active tasks.

Two changes needed:

1. **Exclude `completed/` and `archive/` from RAG indexing** — add both directories to `DEFAULT_EXCLUDE_PATTERNS` in `lib/exclusion.mjs`. On startup, purge any already-indexed files from those directories (they may exist in the hash cache and vector DB from before the exclusion).

2. **Update the `backlog-semantic-search` skill** to instruct agents to use `backlog_task_complete` (which moves the file to `completed/`) instead of `backlog_task_edit(status="Done")` (which just flips the status field). This ensures finished tasks actually leave the indexed directory.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Files in `backlog/completed/` and `backlog/archive/` are not ingested during auto-ingest
- [x] #2 File watcher ignores changes in `completed/` and `archive/` directories
- [x] #3 Already-indexed completed/archived files are purged from the vector DB on startup
- [x] #4 The `backlog-semantic-search` skill instructs agents to use `backlog_task_complete` for finishing tasks
- [x] #5 Existing tests still pass
- [x] #6 No new dependencies added
<!-- AC:END -->
