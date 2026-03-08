---
id: TASK-9
title: Add unit tests for backlog task preprocessing
status: Done
assignee: []
created_date: '2026-03-07 21:28'
updated_date: '2026-03-08 09:05'
labels:
  - testing
  - rag-server
dependencies: []
priority: medium
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The backlog task preprocessing in rag-server.mjs has complex regex and edge cases (semicolon separators, 50-char padding, YAML frontmatter parsing, label extraction, HTML section marker stripping). This is the most regression-prone code in the project with zero test coverage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tests cover backlog task detection (YAML frontmatter with id + title)
- [x] #2 Tests cover field extraction (title, priority, labels, description)
- [x] #3 Tests cover semicolon separator assembly
- [x] #4 Tests cover 50-char minimum padding logic
- [x] #5 Tests cover HTML section marker stripping
- [x] #6 Tests cover edge cases: missing fields, empty description, inline vs list labels
- [x] #7 Tests run with a lightweight runner (no heavy framework needed)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extracted pure functions from rag-server.mjs into rag-utils.mjs for testability. Created rag-utils.preprocessing.test.mjs with 33 tests covering: isBacklogTask detection (7 tests), field extraction (7 tests), semicolon separator assembly (5 tests), 50-char padding logic (3 tests), HTML section marker stripping (3 tests), and edge cases (6 tests). Uses node:test + node:assert with zero external dependencies.
<!-- SECTION:FINAL_SUMMARY:END -->
