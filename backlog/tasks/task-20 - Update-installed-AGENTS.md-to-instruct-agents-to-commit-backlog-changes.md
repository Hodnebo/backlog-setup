---
id: TASK-20
title: Update installed AGENTS.md to instruct agents to commit backlog changes
status: Done
assignee: []
created_date: '2026-03-08 08:40'
updated_date: '2026-03-08 12:14'
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
- [x] #1 setup.sh installed AGENTS.md content instructs agents to commit backlog file changes
- [x] #2 Commit guidance covers task creates, edits, and status transitions
- [x] #3 Instruction is clear about when to commit (e.g. after task operations, not mid-implementation)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a \"Committing backlog changes\" subsection to the AGENTS.md heredoc in setup.sh. The new content instructs AI agents to: (1) commit backlog/ files after batches of task operations using `git add backlog/ && git commit`, (2) covers creates, edits, and status transitions with concrete examples, (3) clarifies timing — commit after planning/status batches, not mid-implementation, and combine with code commits when appropriate.
<!-- SECTION:FINAL_SUMMARY:END -->
