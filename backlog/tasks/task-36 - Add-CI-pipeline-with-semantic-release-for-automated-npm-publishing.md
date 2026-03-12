---
id: TASK-36
title: Add CI pipeline with semantic-release for automated npm publishing
status: In Progress
assignee: []
created_date: '2026-03-12 13:26'
updated_date: '2026-03-12 13:29'
labels:
  - ci
  - dx
  - platform
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Set up GitHub Actions CI that runs tests on PRs and auto-publishes to npm on merge to main using semantic-release. Conventional commits (`feat:`, `fix:`, `chore:`, etc.) determine version bumps automatically.

**Key requirements:**

1. **Path filtering** — only trigger the release pipeline when source files change. Ignore:
   - `backlog/` (task file churn from auto-commit)
   - `README.md`, `docs/`, `AGENTS.md` (docs-only changes shouldn't publish)
   - `.opencode/`, `.mcp.json`, `opencode.json` (editor configs)
   - `.lancedb/`, `.mcp-local-rag-models/` (local data)

   Files that SHOULD trigger a release:
   - `setup.mjs`
   - `lib/**`
   - `skills/**`
   - `backlog-commit-hook.sh`
   - `package.json`

2. **Two workflows:**
   - `ci.yml` — runs `npm test` on PRs and pushes (all branches). Fast, no secrets needed.
   - `release.yml` — runs on push to `main`, only when source files changed. Runs tests, then `npx semantic-release`.

3. **semantic-release config** — add `.releaserc.json` (or in package.json):
   - Plugins: `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, `@semantic-release/npm`, `@semantic-release/github`
   - Default branch: `main`

4. **Authentication — npm Trusted Publishing (OIDC):**
   - No `NPM_TOKEN` secret needed. GitHub Actions authenticates directly with npm via OpenID Connect.
   - The release workflow needs `permissions: id-token: write` to request the OIDC token.
   - The npm package must be linked to the GitHub repo as a trusted publisher:
     1. Go to npmjs.com → `backlog-setup` → Settings → Trusted Publishing
     2. Add GitHub Actions as a trusted publisher (repo: `Hodnebo/backlog-setup`, workflow: `release.yml`, environment: optional)
   - The workflow uses `--provenance` flag on `npm publish` to attach cryptographic provenance.
   - `GITHUB_TOKEN` — built-in, no setup needed (used for GitHub releases).

5. **Conventional commits convention** — adopt going forward:
   - `feat:` → minor bump (1.x.0)
   - `fix:` → patch bump (1.0.x)
   - `feat!:` or `BREAKING CHANGE:` → major bump (x.0.0)
   - `chore:`, `docs:`, `ci:`, `test:` → no release

6. **Dev dependencies to add:** `semantic-release` (and its default plugins)

7. **Note:** Check if semantic-release supports npm Trusted Publishing (OIDC) natively. If not, may need to split: semantic-release for versioning/changelog/git-tag, then a separate step for `npm publish --provenance` using the OIDC token.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PRs run tests automatically via GitHub Actions
- [ ] #2 Merging a feat: or fix: commit to main publishes a new version to npm automatically
- [ ] #3 Changes only to backlog/ or docs do not trigger a release
- [ ] #4 GitHub releases are created with auto-generated release notes
- [ ] #5 Publishing uses npm Trusted Publishing (OIDC) — no NPM_TOKEN secret stored
- [ ] #6 Published packages include provenance attestation (--provenance flag)
<!-- AC:END -->
