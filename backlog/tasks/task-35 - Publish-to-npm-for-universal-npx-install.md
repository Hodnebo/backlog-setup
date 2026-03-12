---
id: TASK-35
title: Publish to npm for universal npx install
status: In Progress
assignee: []
created_date: '2026-03-12 13:10'
updated_date: '2026-03-12 13:22'
labels:
  - platform
  - dx
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Currently the install path diverges by platform: `curl | bash` on Unix, manual `git clone` + `node setup.mjs` on Windows. Since Node.js is already a hard prerequisite, publishing to npm enables a single universal command on all platforms:

```
npx backlog-setup /path/to/project
```

**What's needed:**
- Add `bin` field to `package.json` pointing to `setup.mjs`
- Add `files` field to limit the published package to `setup.mjs`, `lib/`, `skills/`, `backlog-commit-hook.sh`
- Check npm for package name availability (`backlog-setup`); fall back to scoped `@hodnebo/backlog-setup` if taken
- `npm publish`
- Update README Quick start to show `npx` as the primary install method (keep `curl | bash` as alternative)
- Update `install.sh` header comment to mention npx as the preferred method

**What already works:**
- `setup.mjs` has `#!/usr/bin/env node` shebang
- `SCRIPT_DIR` is computed from `import.meta.url` (works from npx cache dir)
- All file copies use paths relative to `SCRIPT_DIR`
- `lib/platform.mjs` import is relative (`./lib/platform.mjs`)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 npx backlog-setup /path/to/project works on macOS, Linux, and Windows
- [x] #2 Published npm package includes only setup.mjs, lib/, skills/, and backlog-commit-hook.sh
- [x] #3 README shows npx as the primary install command
- [x] #4 All existing flags work via npx (--local-cache, --submodule, --backlog-remote, --update, --yes)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Published `backlog-setup@1.0.0` to npm. Universal install now works via `npx backlog-setup /path/to/project` on all platforms.\n\n**Changes:**\n- `package.json`: Added `bin` field pointing to `setup.mjs`, `files` whitelist (setup.mjs, lib/, skills/, backlog-commit-hook.sh), keywords, license MIT. Removed bogus `main: \"index.js\"`.\n- `README.md`: Rewrote Quick Start with `npx backlog-setup` as the primary command. Moved curl|bash and git clone to \"Alternative install methods\".\n- `install.sh`: Updated header comment to mention npx as the preferred method.\n\n**Verified:** `npx backlog-setup --help` works, npm pack includes exactly the right 15 files (139KB unpacked), all 140 tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
