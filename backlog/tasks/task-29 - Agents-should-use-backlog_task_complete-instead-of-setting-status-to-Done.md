---
id: TASK-29
title: Agents should use backlog_task_complete instead of setting status to Done
status: To Do
assignee: []
created_date: '2026-03-08 16:57'
labels:
  - dx
  - backlog-workflow
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When agents finish a task, they set `status: Done` via `backlog_task_edit` instead of calling `backlog_task_complete`, which moves the task to the `backlog/completed/` folder. The distinction matters — `backlog_task_complete` is the proper finalization step that archives the task out of the active task list.

This is a systemic issue: the AGENTS.md instructions, skill definitions, or workflow guides need to explicitly instruct agents to use `backlog_task_complete` (not `backlog_task_edit` with `status: Done`) when finishing a task. The current guidance is ambiguous enough that agents default to the simpler status change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Workflow guidance (AGENTS.md, skills, or backlog guides) explicitly instructs agents to call backlog_task_complete for finished tasks
- [ ] #2 Agents no longer set status to Done manually as the final step — they use backlog_task_complete instead
<!-- AC:END -->
