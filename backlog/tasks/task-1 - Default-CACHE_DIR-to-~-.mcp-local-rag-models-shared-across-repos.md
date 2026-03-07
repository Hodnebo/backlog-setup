---
id: TASK-1
title: Default CACHE_DIR to ~/.mcp-local-rag-models (shared across repos)
status: Done
assignee: []
created_date: '2026-03-07 20:33'
labels:
  - enhancement
  - setup.sh
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Currently setup.sh sets CACHE_DIR to $TARGET_DIR/.mcp-local-rag-models, meaning every repo downloads its own ~90MB embedding model. Change the default to ~/.mcp-local-rag-models so the model is shared across all repos.

Affected locations:
- setup.sh line 157: .mcp.json CACHE_DIR for Claude Code / Cursor
- setup.sh line 188: opencode.json CACHE_DIR for OpenCode  
- setup.sh lines 235-257: model pre-download path check and cache dir
- rag-server.mjs line 34: CACHE_DIR fallback default

Acceptance criteria:
- New installs default CACHE_DIR to ~/.mcp-local-rag-models
- Existing installs are not broken (env var override still works)
- First repo setup downloads model to shared dir; subsequent repos skip download
- README documents the new default
<!-- SECTION:DESCRIPTION:END -->
