---
id: TASK-8
title: Add directory exclusion patterns for recursive scan
status: Done
assignee: []
created_date: '2026-03-07 21:28'
updated_date: '2026-03-08 08:39'
labels:
  - enhancement
  - rag-server
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
No way to skip directories during the recursive file scan. If BASE_DIR is broader than just backlog/, directories like .git or node_modules could get indexed. Add support for exclusion patterns (gitignore-style or a .ragignore file) to filter out unwanted directories and files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Common directories (.git, node_modules, .lancedb) are excluded by default
- [x] #2 Users can define additional exclusion patterns via environment variable or .ragignore file
- [x] #3 Exclusion patterns support glob syntax
- [x] #4 Excluded files are not scanned, hashed, or ingested
- [x] #5 Default exclusions are documented in README
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added directory exclusion patterns to rag-server.mjs recursive file scanner and live file watcher.\n\n**Changes:**\n- `rag-server.mjs`: Added `globToRegex()` converter, `isExcluded()` checker, `loadExcludePatterns()` loader. Wired into `findFiles()` and watcher event handler. Default exclusions: `.git`, `node_modules`, `.lancedb`, `.mcp-local-rag-models`, `.DS_Store`, `.opencode`.\n- `README.md`: New \"Exclusion patterns\" section documenting defaults, `EXCLUDE_PATTERNS` env var, `.ragignore` file format, and glob syntax table.\n- `AGENTS.md`: Added critical pattern #6 for directory exclusion.\n\nNo new dependencies. Zero-dep glob-to-regex matcher supporting `*`, `**`, `?`, bare names, anchored patterns, and trailing slashes.
<!-- SECTION:FINAL_SUMMARY:END -->
