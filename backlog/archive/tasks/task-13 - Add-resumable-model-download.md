---
id: TASK-13
title: Add resumable model download
status: To Do
assignee: []
created_date: '2026-03-07 21:28'
updated_date: '2026-03-08 08:37'
labels:
  - enhancement
  - setup
dependencies: []
priority: low
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The ~90MB embedding model download during setup has no resume capability. On unstable connections the download can fail partway through, requiring a full restart. Add resume support or at minimum a retry mechanism for the model pre-download step in setup.sh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Failed model downloads are retried automatically (at least 2 attempts)
- [ ] #2 Partial downloads do not leave corrupted cache state
- [ ] #3 User sees clear progress/retry messaging during download
- [ ] #4 Successful downloads on first attempt have no extra overhead
<!-- AC:END -->
