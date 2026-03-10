---
id: TASK-31
title: Install lib/ to a shared location instead of copying into every project
status: Done
assignee: []
created_date: '2026-03-10 15:44'
updated_date: '2026-03-10 19:00'
labels:
  - enhancement
  - setup
  - dx
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Currently setup.sh copies the entire lib/ directory into the target project. Every repo gets its own duplicate of rag-server.mjs, preprocessing.mjs, backlog-proxy.mjs, etc. This is unusual — normal tools install once to a shared location and reference from there.

**Current behavior:**
- lib/ is copied into each target project
- Each project commits these files to its own repo
- Updating requires re-running setup.sh --update on every project
- Target project git history includes backlog-setup infrastructure code

**Expected behavior (like a normal install):**
- setup.sh installs lib/ to a shared location like ~/.local/share/backlog-setup/lib/ (or keeps using the cloned repo location)
- MCP configs in target projects point to the shared location instead of local copies
- Updating means pulling the latest backlog-setup once — all projects pick it up
- Target projects stay clean: no lib/ directory, no infrastructure files in their git

**Things to consider:**
- MCP server commands in .mcp.json and opencode.json would reference the shared path (e.g. node ~/.local/share/backlog-setup/lib/rag-server.mjs)
- env vars like BASE_DIR and DB_PATH still need to be project-local (data is per-project, code is shared)
- backlog-commit-hook.sh could also live in the shared location
- Existing installations need a migration path (remove local lib/, update configs)
- The --update flag becomes simpler since there is nothing to copy per-project
- curl-pipe-bash install path needs to work too (download to shared location)
- Consider what happens if the shared location is deleted or moved
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved lib/, backlog-commit-hook.sh, and mcp-local-rag node_modules from per-project copies to a shared install at ~/.local/share/backlog-setup/. MCP configs in target projects now reference the shared location. setup.sh auto-migrates existing per-project installs on next run. README.md and AGENTS.md updated to reflect the new layout. All 90 tests pass, shell syntax validated.
<!-- SECTION:FINAL_SUMMARY:END -->
