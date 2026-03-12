---
id: TASK-32
title: >-
  Proxy should auto-set status to Done before forwarding task_complete to
  upstream
status: To Do
assignee: []
created_date: '2026-03-12 08:52'
labels:
  - bug
  - backlog-proxy
dependencies: []
references:
  - lib/backlog-proxy.mjs
  - test/backlog-proxy.test.mjs
  - lib/workflow-guides.mjs
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The backlog proxy instructs agents to call `backlog_task_complete` directly (not `backlog_task_edit` with status "Done"). However, the upstream backlog.md `task_complete` tool requires the task to already be in "Done" status before it can be completed.

The proxy handles the wrong-tool case (`task_edit` with status "Done" → auto-chains edit + complete), but does NOT handle the correct-tool case (`task_complete` called directly). When an agent follows our guidance and calls `task_complete` on a task in "In Progress" or "To Do" status, the call passes straight through to upstream and fails because the prerequisite isn't met.

**Fix:** Intercept `task_complete` calls in `createToolHandler()` and auto-set status to "Done" via `task_edit` before forwarding to upstream `task_complete`. This makes the agent-facing API work as documented — call `task_complete` and it just works regardless of current status.

**Evidence of the problem:** TASK-30 and TASK-31 are stuck in `backlog/tasks/` with `status: Done` but never moved to `completed/`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Calling `task_complete` on a task in any status (To Do, In Progress, Draft) succeeds — proxy auto-sets status to Done before forwarding
- [ ] #2 Calling `task_complete` on a task already in Done status still works (no double-edit)
- [ ] #3 Test coverage for direct `task_complete` interception with non-Done status
- [ ] #4 Existing auto-chain behavior for `task_edit(status=Done)` is preserved
<!-- AC:END -->
