---
id: TASK-20
title: Update installed AGENTS.md to instruct agents to commit backlog changes
status: To Do
assignee: []
created_date: '2026-03-08 08:40'
labels:
  - enhancement
  - setup
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The AGENTS.md content that setup.sh appends into target projects doesn't instruct AI agents to commit backlog task file changes. After creating, editing, or moving tasks, the modified .md files in backlog/ sit uncommitted. The installed AGENTS.md prompt should tell agents to commit backlog changes (task creates, edits, status moves, etc.) so they don't accumulate as dirty working tree noise.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 setup.sh installed AGENTS.md content instructs agents to commit backlog file changes
- [ ] #2 Commit guidance covers task creates, edits, and status transitions
- [ ] #3 Instruction is clear about when to commit (e.g. after task operations, not mid-implementation)
<!-- AC:END -->
