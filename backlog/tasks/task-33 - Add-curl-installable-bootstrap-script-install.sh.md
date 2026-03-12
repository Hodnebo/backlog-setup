---
id: TASK-33
title: Add curl-installable bootstrap script (install.sh)
status: To Do
assignee: []
created_date: '2026-03-12 12:09'
labels:
  - enhancement
  - dx
dependencies: []
references:
  - setup.sh
  - README.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add an `install.sh` bootstrap script that enables curl-pipe-bash installation without cloning the repo first, similar to how `uv`, `rustup`, etc. work.

`setup.sh` isn't self-contained — it needs `lib/`, `skills/`, and `backlog-commit-hook.sh` alongside it. The bootstrap script should clone the repo to a temp dir, run `setup.sh` with all forwarded arguments, then clean up.

**Target UX:**
```bash
curl -LsSf https://raw.githubusercontent.com/Hodnebo/backlog-setup/main/install.sh | bash -s -- /path/to/project
curl -LsSf https://raw.githubusercontent.com/Hodnebo/backlog-setup/main/install.sh | bash -s -- --update /path/to/project
```

The bootstrap script should:
- Clone the repo to a temp dir (shallow clone for speed)
- Forward all arguments to `setup.sh`
- Clean up the temp dir on exit (trap)
- Fail gracefully if git isn't available
- Follow the same shell style as `setup.sh` (`set -euo pipefail`, log helpers, etc.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 install.sh is a self-contained shell script that works via curl-pipe-bash
- [ ] #2 Clones repo to temp dir (shallow), runs setup.sh with forwarded args, cleans up on exit
- [ ] #3 Works for fresh installs and --update
- [ ] #4 Fails gracefully with clear error if git is not available
- [ ] #5 README updated with the curl install command
<!-- AC:END -->
