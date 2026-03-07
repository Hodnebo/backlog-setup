---
id: TASK-2
title: Add --local-cache flag to opt out of shared model cache
status: Done
assignee: []
created_date: '2026-03-07 20:33'
labels:
  - enhancement
  - setup.sh
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After switching CACHE_DIR default to ~/.mcp-local-rag-models (shared), add a --local-cache flag to setup.sh that reverts to per-repo behavior ($TARGET_DIR/.mcp-local-rag-models) for users who want isolation.

Implementation:
- Parse --local-cache flag in setup.sh argument handling
- When set, use $TARGET_DIR/.mcp-local-rag-models in generated MCP configs
- When not set, use ~/.mcp-local-rag-models (new default)
- Document the flag in setup.sh --help and README

Depends on: TASK-1
<!-- SECTION:DESCRIPTION:END -->
