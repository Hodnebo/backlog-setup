---
id: TASK-5
title: 'Handle migration: existing per-repo cache to shared cache'
status: Done
assignee: []
created_date: '2026-03-07 20:34'
labels:
  - enhancement
  - setup.sh
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When setup.sh is re-run on a project that already has a per-repo model cache at $TARGET_DIR/.mcp-local-rag-models, it should:

1. Detect the existing per-repo cache
2. If shared cache at ~/.mcp-local-rag-models doesn't exist yet: move (not copy) the per-repo cache to the shared location
3. If shared cache already exists: remove the per-repo cache to reclaim ~90MB disk
4. Update the MCP configs (if they still point to per-repo) to use the shared path
5. Print a message explaining what happened

This ensures users who upgrade get the disk savings without re-downloading.

Depends on: TASK-1
<!-- SECTION:DESCRIPTION:END -->
