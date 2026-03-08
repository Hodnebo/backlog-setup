---
id: TASK-26
title: Add error handling for backlog init failure in setup.sh
status: To Do
assignee: []
created_date: '2026-03-08 14:32'
labels:
  - bug
  - setup
dependencies: []
references:
  - setup.sh
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
setup.sh runs `backlog init` with `|| true`, silently swallowing failures. If the backlog CLI is broken, missing, or the init fails for any reason, the script continues and later steps fail with confusing errors (e.g. missing backlog/ directory).

Should check that backlog init actually succeeded and that the expected backlog/ directory exists before proceeding.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 backlog init failure produces a clear error message and exits setup
- [ ] #2 Missing backlog/ directory after init is detected and reported
- [ ] #3 Existing successful setup flow is unchanged
- [ ] #4 bash -n setup.sh still passes
<!-- AC:END -->
