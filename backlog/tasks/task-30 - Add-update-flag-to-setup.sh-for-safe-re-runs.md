---
id: TASK-30
title: Add --update flag to setup.sh for safe re-runs
status: Done
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
- [x] #1 Running setup.sh --update regenerates .mcp.json and opencode.json with current templates (backing up old files as .bak)
- [x] #2 Running setup.sh --update replaces the ## Backlog Workflow section in AGENTS.md with the latest template without touching other content
- [x] #3 Running setup.sh without --update preserves existing skip behavior (no regression)
<!-- AC:END -->

## Final Summary

Implemented --update flag for setup.sh. In update mode, .mcp.json and opencode.json are backed up as .bak before overwriting with current templates. AGENTS.md uses `<!-- BACKLOG_WORKFLOW:BEGIN/END -->` HTML comment markers; --update removes the old section via sed and re-appends the latest template. Without --update, existing configs are skipped (no regression). Also removed the "Committing backlog changes" subsection from the AGENTS.md template since backlog-commit-hook.sh handles auto-commits. Updated README.md with --update docs.
