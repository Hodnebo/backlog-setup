---
id: TASK-4
title: Update README to document shared model cache behavior
status: Done
assignee: []
created_date: '2026-03-07 20:34'
labels:
  - docs
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After implementing shared model cache (TASK-1), update README.md:

1. Update 'What setup.sh does' section to mention shared cache at ~/.mcp-local-rag-models
2. Update 'Files created in your project' section — .mcp-local-rag-models/ is no longer per-project
3. Update 'Environment variables' table — CACHE_DIR default changes from per-repo to ~/.mcp-local-rag-models  
4. Update 'Sharing the model cache' section — this is now the default, explain how to opt out with --local-cache
5. Update .gitignore section — .mcp-local-rag-models/ no longer needed in per-project gitignore

Depends on: TASK-1, TASK-2
<!-- SECTION:DESCRIPTION:END -->
