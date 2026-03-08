---
id: TASK-19
title: Add test suite for rag-server.mjs exclusion and glob logic
status: To Do
assignee: []
created_date: '2026-03-08 08:38'
labels:
  - testing
  - rag-server
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The rag-server.mjs exclusion engine (`globToRegex`, `isExcluded`, `loadExcludePatterns`, `findFiles` filtering) has no automated tests. These are pure functions with tricky edge cases (bare names vs glob patterns, anchored vs unanchored, path segment boundaries) that are easy to regress on.

Create a lightweight test suite (likely using Node.js built-in `node:test` + `node:assert`) covering:
- `globToRegex()` — bare names, `*`, `**`, `?`, anchored `/`, trailing `/`, mixed patterns
- `isExcluded()` — matching against various relative paths
- `loadExcludePatterns()` — default patterns, env var parsing, .ragignore file loading
- Edge cases: empty patterns, comment lines, overlapping patterns, deeply nested paths

No external test framework dependency — use `node:test` (available in Node 18+).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 globToRegex() is tested for all supported syntax: bare names, *, **, ?, leading /, trailing /
- [ ] #2 isExcluded() is tested with relative paths against compiled patterns
- [ ] #3 loadExcludePatterns() is tested for defaults, EXCLUDE_PATTERNS env var, and .ragignore file parsing
- [ ] #4 Tests run via `node --test` with zero external dependencies
- [ ] #5 All tests pass on Node 18+
<!-- AC:END -->
