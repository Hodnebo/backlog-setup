---
id: TASK-37
title: 'Remove pre-npx installation artifacts (setup.sh, install.sh, bash hook)'
status: Done
assignee: []
created_date: '2026-03-12 14:06'
updated_date: '2026-03-12 14:33'
labels:
  - cleanup
  - developer-experience
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Now that `npx backlog-setup` is the sole installation method, several files and references from the pre-npx era are dead weight:

**Files to remove:**
- `setup.sh` (870-line bash installer) — fully superseded by `setup.mjs`
- `install.sh` (curl-pipe-bash bootstrap) — only existed to clone repo and run `setup.mjs`; npx does this natively
- `backlog-commit-hook.sh` — bash commit hook superseded by `backlog-commit-hook.mjs`; still listed in `package.json` `files` array

**References to clean up:**
- `README.md` — "Alternative install methods" section (curl|bash, git clone), header comment in setup.mjs referencing curl|bash, Windows support table mentioning `curl | bash`
- `AGENTS.md` — mentions `setup.sh` as a source area and in the commands section
- `package.json` `files` array — remove `backlog-commit-hook.sh` entry
- `setup.mjs` — header comment still says "Equivalent to setup.sh"
- Any remaining references to `install.sh` or `setup.sh` across docs

**Out of scope:**
- Anything in `backlog/completed/` (historical task records, leave as-is)
- The shared install still copies `backlog-commit-hook.sh` for backward compat — evaluate whether that's still needed or if the Node.js hook is sufficient
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 setup.sh and install.sh are deleted from the repo
- [x] #2 backlog-commit-hook.sh is deleted and removed from package.json files array
- [x] #3 README.md no longer mentions curl|bash or git clone as install methods
- [x] #4 AGENTS.md no longer references setup.sh
- [x] #5 setup.mjs header comment no longer references setup.sh
- [ ] #6 npx backlog-setup still works (the only install path)
- [x] #7 No broken references to removed files remain in tracked files (excluding backlog/completed/)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The bash commit hook backward-compat in setup.mjs was removed entirely — the Node.js hook (lib/backlog-commit-hook.mjs) is cross-platform and sufficient. Task-26 (setup.sh error handling) and task-30 (setup.sh --update flag) in backlog/tasks/ are now obsolete but left as-is per out-of-scope rule.
<!-- SECTION:NOTES:END -->
