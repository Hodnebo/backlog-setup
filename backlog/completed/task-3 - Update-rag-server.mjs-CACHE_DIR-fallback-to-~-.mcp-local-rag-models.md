---
id: TASK-3
title: Update rag-server.mjs CACHE_DIR fallback to ~/.mcp-local-rag-models
status: Done
assignee: []
created_date: '2026-03-07 20:34'
labels:
  - enhancement
  - rag-server
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
rag-server.mjs line 34 has a fallback CACHE_DIR that defaults to a per-repo path. Update this to match the new shared default (~/.mcp-local-rag-models) so the server works correctly even if the MCP config doesn't explicitly set CACHE_DIR.

Current code:
  const CACHE_DIR = process.env.CACHE_DIR || join(BASE_DIR, '.rag-models');

Change to:
  const CACHE_DIR = process.env.CACHE_DIR || join(os.homedir(), '.mcp-local-rag-models');

Note: import os or use process.env.HOME.

Depends on: TASK-1
<!-- SECTION:DESCRIPTION:END -->
