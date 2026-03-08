---
id: TASK-25
title: Fix anchored glob patterns ignored for bare names
status: To Do
assignee: []
created_date: '2026-03-08 14:32'
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
- [ ] #1 Anchored bare-name patterns (e.g. /dist) only match at the path root, not nested
- [ ] #2 Non-anchored bare names (e.g. dist) still match anywhere in the path
- [ ] #3 Existing exclusion tests updated to reflect correct anchoring behavior
- [ ] #4 No regressions in default exclusion patterns (.git, node_modules, etc.)
<!-- AC:END -->
