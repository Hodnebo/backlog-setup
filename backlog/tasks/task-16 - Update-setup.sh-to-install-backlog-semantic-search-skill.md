---
id: TASK-16
title: Update setup.sh to install backlog semantic search skill
status: Done
assignee: []
created_date: '2026-03-08 08:01'
updated_date: '2026-03-08 08:08'
labels:
  - implementation
  - installer
dependencies:
  - TASK-14
  - TASK-15
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a section to setup.sh that copies the backlog semantic search skill into the target repo's skill directory. Should be idempotent (check-then-act pattern per AGENTS.md). Also update the MCP config generation to use the new backlog-named tool server.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Skill file is copied to target repo's skill directory
- [x] #2 Idempotent: re-running setup.sh doesn't duplicate the skill
- [x] #3 MCP config points to the new rag-server.mjs with backlog-named tools
- [x] #4 Follows existing setup.sh code style (set -euo pipefail, log helpers, etc.)
<!-- AC:END -->
