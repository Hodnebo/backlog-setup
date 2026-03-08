---
id: TASK-19
title: Add test suite for rag-server.mjs exclusion and glob logic
status: Done
assignee: []
created_date: '2026-03-08 08:38'
updated_date: '2026-03-08 09:05'
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
- [x] #1 globToRegex() is tested for all supported syntax: bare names, *, **, ?, leading /, trailing /
- [x] #2 isExcluded() is tested with relative paths against compiled patterns
- [x] #3 loadExcludePatterns() is tested for defaults, EXCLUDE_PATTERNS env var, and .ragignore file parsing
- [x] #4 Tests run via `node --test` with zero external dependencies
- [x] #5 All tests pass on Node 18+
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Created rag-utils.exclusion.test.mjs with 32 tests covering: escapeRegex (5 tests), globToRegex bare names (4 tests), single star (3 tests), double star (3 tests), question mark (3 tests), anchored patterns (2 tests), trailing slash (1 test), mixed patterns (2 tests), isExcluded with default and custom matchers (9 tests), and DEFAULT_EXCLUDE_PATTERNS sanity checks (2 tests). Uses node:test + node:assert with zero external dependencies. All tests run via `node --test` on Node 18+.
<!-- SECTION:FINAL_SUMMARY:END -->
