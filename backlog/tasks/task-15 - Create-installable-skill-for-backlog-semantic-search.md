---
id: TASK-15
title: Create installable skill for backlog semantic search
status: Done
assignee: []
created_date: '2026-03-08 08:01'
updated_date: '2026-03-08 08:06'
labels:
  - implementation
  - skill
dependencies:
  - TASK-14
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a skill file that teaches AI agents when to use `backlog_semantic_search` (RAG semantic) vs `backlog_task_search` (Fuse.js keyword). The skill should explain the strengths of each: semantic search for conceptual/synonym/natural-language queries, keyword search for exact ID/title/label lookups. This skill gets installed into target repos by setup.sh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Skill file follows opencode skill format
- [x] #2 Clearly explains when to use semantic search vs keyword search
- [x] #3 Includes trigger phrases for when the skill should activate
- [x] #4 File is ready for setup.sh to copy into target repos
<!-- AC:END -->
