---
id: TASK-12
title: Optimize batch deletion for large backlogs
status: To Do
assignee: []
created_date: '2026-03-07 21:28'
updated_date: '2026-03-08 08:37'
labels:
  - performance
  - rag-server
dependencies: []
priority: low
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
File deletions from the vector DB happen in a sequential loop with individual delete calls. For large backlogs with many removed files, this could be slow. Investigate whether mcp-local-rag supports batch deletion and use it if available, or at minimum run deletions concurrently.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Deletions are performed concurrently or in batch rather than sequentially
- [ ] #2 Dual deletion strategy (source-based + filePath-based) is preserved
- [ ] #3 Error in one deletion does not block others
- [ ] #4 Deletion count and errors are still reported in summary log
<!-- AC:END -->
