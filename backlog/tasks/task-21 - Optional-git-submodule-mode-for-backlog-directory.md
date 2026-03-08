---
id: TASK-21
title: Optional git submodule mode for backlog directory
status: Done
assignee: []
created_date: '2026-03-08 12:04'
updated_date: '2026-03-08 12:19'
labels:
  - enhancement
  - setup
  - git
dependencies:
  - TASK-20
references:
  - setup.sh
  - AGENTS.md
  - TASK-20
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When multiple people/agents work on a backlog simultaneously, committing task changes directly to main creates noisy history and potential merge conflicts. Add an optional submodule mode where the backlog/ directory is a separate git repository wired as a submodule.

**Current behavior (unchanged, remains the default):**
`./setup.sh /path/to/project` creates backlog/ as a plain directory inside the project repo. All task files are tracked by the project's git.

**New opt-in behavior:**
`./setup.sh /path/to/project --submodule --backlog-remote <url>` initializes backlog/ as a git submodule pointing to a separate repository. Task commits happen in the submodule repo independently of the main project history.

**Why this helps with concurrent access:**
- Task commits (frequent, noisy) stay in the backlog repo — main project history is clean code-only
- Agents and humans can commit task changes freely without polluting project history
- Conflicts are isolated to the backlog repo and are granular (one file per task)
- The submodule pointer in the main repo only updates explicitly (e.g. at milestone boundaries)

**Why it must be optional:**
- Solo developers or small teams may prefer the simplicity of a single repo
- Not all projects use git
- Submodule complexity should only exist when the tooling fully abstracts it

**Key design principle:** All backlog tooling (MCP server, skills, agent hooks) operates on file paths via BASE_DIR. These tools must work identically regardless of whether backlog/ is a plain directory or a submodule. The git layer is orthogonal to the backlog data layer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 setup.sh accepts --submodule and --backlog-remote flags
- [x] #2 With --submodule: backlog/ is initialized as a git submodule pointing to the specified remote
- [x] #3 With --submodule and no existing remote repo: setup.sh creates the backlog repo locally and wires it as a submodule (user can add remote later)
- [x] #4 Without --submodule: behavior is identical to current (plain directory, no git changes)
- [x] #5 setup.sh handles the case where backlog/ already exists as a plain directory and user wants to convert to submodule
- [x] #6 setup.sh handles fresh clone with --recursive or auto-runs git submodule update --init
- [x] #7 Installed AGENTS.md content detects submodule mode and instructs agents on the commit workflow: pull --rebase in submodule, commit, push
- [x] #8 Installed AGENTS.md content in non-submodule mode uses the simpler commit-to-main workflow from TASK-20
- [x] #9 All existing backlog tooling (rag-server.mjs, MCP tools, skills) works without modification in both modes
- [x] #10 README documents submodule mode setup, usage, and tradeoffs
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added optional git submodule mode to setup.sh. Changes:\n\n**setup.sh:**\n- New flags: `--submodule` and `--backlog-remote <url>` with validation\n- New section after backlog init handles 5 cases: already a submodule (skip), fresh clone with .gitmodules (init), plain dir conversion, standalone .git repo wiring, and fresh submodule add from remote\n- For no-remote submodule mode, creates a local bare repo at `.backlog-repo.git`\n- AGENTS.md heredoc split into mode-dependent commit workflow: submodule mode instructs cd into submodule + pull --rebase + commit + push + submodule pointer update; plain mode uses the simpler git add backlog/ workflow\n- .gitignore entries include `.backlog-repo.git`\n- Summary output shows submodule mode indicator when active\n\n**README.md:**\n- New \"Submodule mode\" section covering: setup with/without remote, converting existing plain dir, cloning with --recursive, how it works, and tradeoffs table\n- Updated \"What setup.sh does\" list to include submodule and AGENTS.md steps\n\n**No changes to rag-server.mjs, MCP tools, or skills** — these operate on file paths via BASE_DIR and are git-layer agnostic by design.
<!-- SECTION:FINAL_SUMMARY:END -->
