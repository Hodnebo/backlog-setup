---
id: TASK-9
title: Add unit tests for backlog task preprocessing
status: To Do
assignee: []
created_date: '2026-03-07 21:28'
updated_date: '2026-03-08 08:37'
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
- [ ] #1 Tests cover backlog task detection (YAML frontmatter with id + title)
- [ ] #2 Tests cover field extraction (title, priority, labels, description)
- [ ] #3 Tests cover semicolon separator assembly
- [ ] #4 Tests cover 50-char minimum padding logic
- [ ] #5 Tests cover HTML section marker stripping
- [ ] #6 Tests cover edge cases: missing fields, empty description, inline vs list labels
- [ ] #7 Tests run with a lightweight runner (no heavy framework needed)
<!-- AC:END -->
