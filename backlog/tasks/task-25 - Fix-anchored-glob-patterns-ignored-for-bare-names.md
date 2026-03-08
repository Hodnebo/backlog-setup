---
id: TASK-25
title: Fix anchored glob patterns ignored for bare names
status: Done
assignee: []
created_date: '2026-03-08 14:32'
updated_date: '2026-03-08 16:32'
labels:
  - bug
  - rag-server
dependencies: []
references:
  - lib/exclusion.mjs
  - test/exclusion.test.mjs
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In lib/exclusion.mjs, the globToRegex() function sets an anchored flag when a pattern starts with / (e.g. /dist), but the bare-name branch (no slash, no glob chars) returns early without checking the flag. Result: /dist matches vendor/dist/ when it should only match dist/ at root.

The test suite already documents this as a known limitation (exclusion.test.mjs line 160) but it should be fixed — anchored patterns are standard gitignore behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Anchored bare-name patterns (e.g. /dist) only match at the path root, not nested
- [x] #2 Non-anchored bare names (e.g. dist) still match anywhere in the path
- [x] #3 Existing exclusion tests updated to reflect correct anchoring behavior
- [x] #4 No regressions in default exclusion patterns (.git, node_modules, etc.)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed `globToRegex()` bare-name branch to check the `anchored` flag. Previously, patterns like `/dist` hit the bare-name early return and produced `(^|/)dist($|/)` (matching anywhere). Now anchored bare names produce `^dist($|/)` (root-only).\n\nChanges:\n- `lib/exclusion.mjs`: Split bare-name branch into anchored (`^name($|/)`) and non-anchored (`(^|/)name($|/)`) paths\n- `test/exclusion.test.mjs`: Replaced known-limitation comment with proper assertions; added tests for anchored bare names not matching nested paths and anchored bare names with trailing slash\n\n69/69 tests pass. Default patterns (.git, node_modules, etc.) unaffected since they are non-anchored.
<!-- SECTION:FINAL_SUMMARY:END -->
