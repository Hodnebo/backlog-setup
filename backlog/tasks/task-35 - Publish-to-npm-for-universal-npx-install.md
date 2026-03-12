---
id: TASK-35
title: Publish to npm for universal npx install
status: In Progress
assignee: []
created_date: '2026-03-12 13:10'
updated_date: '2026-03-12 13:14'
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
- [ ] #1 npx backlog-setup /path/to/project works on macOS, Linux, and Windows
- [ ] #2 Published npm package includes only setup.mjs, lib/, skills/, and backlog-commit-hook.sh
- [ ] #3 README shows npx as the primary install command
- [ ] #4 All existing flags work via npx (--local-cache, --submodule, --backlog-remote, --update, --yes)
<!-- AC:END -->
