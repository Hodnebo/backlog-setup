---
id: TASK-29
title: Agents should use backlog_task_complete instead of setting status to Done
status: In Progress
assignee: []
created_date: '2026-03-08 16:57'
updated_date: '2026-03-08 17:31'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Phase 4 — TDD RED phase complete (2026-03-08)

Created two test files with 21 tests total:

### test/guidance.test.mjs (9 tests, 3 pass / 6 fail)
- **setup.sh AGENTS.md template** (3 tests, 1 pass / 2 fail)
  - ✅ Template found in setup.sh
  - ❌ Template doesn't mention `backlog_task_complete` (line 467 still says `backlog_task_edit`)
  - ❌ Template still instructs `Mark the task "Done" with backlog_task_edit`
- **skills/backlog-semantic-search.md** (2 tests, 2 pass) — already fixed
- **lib/workflow-guides.mjs** (4 tests, 0 pass) — file doesn't exist yet (Phase 1)

### test/backlog-proxy.test.mjs (12 tests, 0 pass / 12 fail)
- All fail with ERR_MODULE_NOT_FOUND — file doesn't exist yet (Phase 2)
- Tests define the expected API:
  - `getGuideOverride(toolName)` → string | null
  - `GUIDE_TOOL_NAMES` → array of 4 tool names
  - `createToolHandler(client)` → handler function
  - Handler intercepts 4 guide tools, forwards all others to client

Existing tests (69) still pass. Ready for GREEN phase (Phases 1-3 implementation).
<!-- SECTION:NOTES:END -->
