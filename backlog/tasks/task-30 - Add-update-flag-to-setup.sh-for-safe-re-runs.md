---
id: TASK-30
title: Add --update flag to setup.sh for safe re-runs
status: To Do
assignee: []
created_date: '2026-03-08 18:45'
labels:
  - dx
  - setup
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When setup.sh is re-run on a project that was already set up, it skips MCP configs (.mcp.json, opencode.json) and the AGENTS.md workflow section because they already exist. This means updates to these templates (like the task-29 proxy change) don't propagate to existing installations.

Add an `--update` flag that:
1. Regenerates MCP configs (backup old ones first, or merge intelligently)
2. Replaces the `## Backlog Workflow` section in AGENTS.md with the current template (preserving any user content above/below)
3. Still copies lib/ and skills as usual (already works)

Without `--update`, behavior stays the same (skip existing configs). With `--update`, configs and AGENTS.md section are refreshed to match the latest templates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running setup.sh --update regenerates .mcp.json and opencode.json with current templates (backing up old files as .bak)
- [ ] #2 Running setup.sh --update replaces the ## Backlog Workflow section in AGENTS.md with the latest template without touching other content
- [ ] #3 Running setup.sh without --update preserves existing skip behavior (no regression)
<!-- AC:END -->
