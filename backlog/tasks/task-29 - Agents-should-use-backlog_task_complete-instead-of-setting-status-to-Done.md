---
id: TASK-29
title: Agents should use backlog_task_complete instead of setting status to Done
status: In Progress
assignee: []
created_date: '2026-03-08 16:57'
updated_date: '2026-03-08 17:26'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### Phase 1: Corrected guide content
1. Create `lib/workflow-guides.mjs` with corrected task-finalization guide text
   - Copy original text, fix the completion workflow to use `backlog_task_complete`
   - Export as named constants for each guide we want to override

### Phase 2: Proxy MCP server
2. Create `lib/backlog-proxy.mjs` — proxy MCP server
   - Spawn `backlog mcp start` as child process via StdioClientTransport
   - Connect as MCP Client, discover all tools/resources
   - Create McpServer, register all tools:
     - Workflow guide tools (4) → return our corrected text
     - All other tools → forward via client.callTool()
   - Similarly intercept workflow guide resources
   - Connect to parent via StdioServerTransport
   - Handle subprocess lifecycle (cleanup on exit, restart on crash)

### Phase 3: Integration
3. Update `setup.sh`:
   - Change MCP config templates to use `node lib/backlog-proxy.mjs` instead of `backlog mcp start`
   - Fix AGENTS.md template: replace `Mark the task "Done" with backlog_task_edit` with `backlog_task_complete` instruction
   - Copy `lib/backlog-proxy.mjs` and `lib/workflow-guides.mjs` to target projects

### Phase 4: Tests
4. Create `test/guidance.test.mjs` — policy tests:
   - setup.sh AGENTS.md template mentions `backlog_task_complete`
   - setup.sh AGENTS.md template does NOT instruct `backlog_task_edit(status: Done)` for completion
   - skills/backlog-semantic-search.md mentions `backlog_task_complete`
   - lib/workflow-guides.mjs mentions `backlog_task_complete`
5. Create `test/backlog-proxy.test.mjs` — proxy unit tests:
   - Intercepted tools return corrected guide text
   - Non-intercepted tools are forwarded (mock client)
   - Guide override lookup logic works correctly
<!-- SECTION:PLAN:END -->
