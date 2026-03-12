/**
 * Cross-platform backlog auto-commit — Node.js replacement for backlog-commit-hook.sh.
 *
 * Called by the RAG server file watcher after backlog files are created,
 * modified, or deleted. Detects git mode and commits accordingly:
 *
 *   - Submodule mode: git add -A → commit → pull --rebase → push (in submodule)
 *   - Plain repo mode: git add backlog/ → commit (no push)
 *   - No git: no-op
 *
 * Can be used two ways:
 *   1. Imported and called via commitBacklogChanges(backlogDir, operation)
 *   2. Run directly: node backlog-commit-hook.mjs <operation>
 *      (reads BACKLOG_DIR from env)
 *
 * Environment:
 *   BACKLOG_AUTO_COMMIT — set to "false" to disable (default: true)
 *   BACKLOG_DIR         — backlog directory path (required when run as CLI)
 */

import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const log = (msg) => process.stderr.write(`[backlog-commit] ${msg}\n`);
const warn = (msg) => process.stderr.write(`[backlog-commit] WARNING: ${msg}\n`);

// ---------------------------------------------------------------------------
// Git helpers — promisified execFile
// ---------------------------------------------------------------------------

/**
 * Run a git command in the given directory.
 *
 * @param {string} cwd — working directory
 * @param {string[]} args — git subcommand and arguments
 * @returns {Promise<string>} stdout
 */
function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`git ${args[0]} failed: ${err.message}${stderr ? ` — ${stderr.trim()}` : ""}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Run a git command, returning null on failure instead of throwing.
 *
 * @param {string} cwd — working directory
 * @param {string[]} args — git subcommand and arguments
 * @returns {Promise<string|null>}
 */
async function gitSafe(cwd, args) {
  try {
    return await git(cwd, args);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Mode detection
// ---------------------------------------------------------------------------

/**
 * Check if backlogDir is a git submodule.
 *
 * Submodule mode: backlog/ has its own .git (file pointing to parent's
 * .git/modules/backlog, or a standalone .git directory).
 *
 * @param {string} backlogDir — absolute path to backlog directory
 * @returns {Promise<boolean>}
 */
async function isSubmodule(backlogDir) {
  const gitPath = `${backlogDir}/.git`;

  // .git file (gitlink) → definitely a submodule
  if (existsSync(gitPath)) {
    try {
      const st = statSync(gitPath);
      if (st.isFile()) return true;
    } catch {
      // stat failed — fall through
    }
  }

  // .git directory → check if it's a standalone repo rooted at backlogDir
  if (existsSync(gitPath)) {
    try {
      const st = statSync(gitPath);
      if (st.isDirectory()) {
        const isWorktree = await gitSafe(backlogDir, ["rev-parse", "--is-inside-work-tree"]);
        if (isWorktree !== "true") return false;
        const toplevel = await gitSafe(backlogDir, ["rev-parse", "--show-toplevel"]);
        return toplevel === backlogDir;
      }
    } catch {
      // fall through
    }
  }

  return false;
}

/**
 * Check if backlogDir's parent is inside a git repo.
 *
 * @param {string} backlogDir — absolute path to backlog directory
 * @returns {Promise<boolean>}
 */
async function isPlainRepo(backlogDir) {
  const parentDir = dirname(backlogDir);
  const result = await gitSafe(parentDir, ["rev-parse", "--is-inside-work-tree"]);
  return result === "true";
}

// ---------------------------------------------------------------------------
// Commit logic
// ---------------------------------------------------------------------------

/**
 * Commit changes in submodule mode: add -A → commit → pull --rebase → push.
 *
 * @param {string} backlogDir — absolute path to backlog directory
 * @param {string} operation — human-readable operation description
 */
async function commitSubmodule(backlogDir, operation) {
  log(`submodule mode: committing in ${backlogDir}`);

  await gitSafe(backlogDir, ["add", "-A"]);

  // Check if there's anything to commit
  const diffResult = await gitSafe(backlogDir, ["diff", "--cached", "--quiet"]);
  if (diffResult !== null) {
    // Exit code 0 means no diff → nothing to commit
    log("nothing to commit");
    return;
  }
  // diff --cached --quiet exits non-zero when there ARE changes (gitSafe returns null)

  const commitResult = await gitSafe(backlogDir, [
    "commit", "--no-verify", "-m", `backlog: ${operation}`,
  ]);
  if (commitResult === null) {
    warn("commit failed in submodule");
    return;
  }

  // Check if remote exists
  const remoteUrl = await gitSafe(backlogDir, ["remote", "get-url", "origin"]);
  if (!remoteUrl) {
    log("committed (no remote configured)");
    return;
  }

  const branch = (await gitSafe(backlogDir, ["branch", "--show-current"])) || "main";

  const pullResult = await gitSafe(backlogDir, ["pull", "--rebase", "origin", branch]);
  if (pullResult === null) {
    warn("pull --rebase failed — commit is local only");
    return;
  }

  const pushResult = await gitSafe(backlogDir, ["push", "origin", branch]);
  if (pushResult === null) {
    warn("push failed — commit is local, push manually later");
    return;
  }

  log(`committed and pushed to ${branch}`);
}

/**
 * Commit changes in plain repo mode: add backlog/ → commit (no push).
 *
 * @param {string} backlogDir — absolute path to backlog directory
 * @param {string} operation — human-readable operation description
 */
async function commitPlainRepo(backlogDir, operation) {
  const parentDir = dirname(backlogDir);
  const gitRoot = await gitSafe(parentDir, ["rev-parse", "--show-toplevel"]);
  if (!gitRoot) return;

  log(`plain repo mode: committing in ${gitRoot}`);

  const backlogRel = relative(gitRoot, backlogDir);
  await gitSafe(gitRoot, ["add", "--", backlogRel]);

  // Check if there's anything to commit
  const diffResult = await gitSafe(gitRoot, ["diff", "--cached", "--quiet"]);
  if (diffResult !== null) {
    log("nothing to commit");
    return;
  }

  const commitResult = await gitSafe(gitRoot, [
    "commit", "--no-verify", "-m", `backlog: ${operation}`,
  ]);
  if (commitResult === null) {
    warn("commit failed");
    return;
  }

  log("committed");
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Auto-commit backlog file changes.
 *
 * Detects whether backlogDir is a submodule, plain repo, or not in git,
 * and commits accordingly.
 *
 * @param {string} backlogDir — absolute path to backlog directory
 * @param {string} operation — human-readable operation description
 */
async function commitBacklogChanges(backlogDir, operation) {
  if (!existsSync(backlogDir)) {
    warn(`BACKLOG_DIR does not exist: ${backlogDir}`);
    return;
  }

  // Check if git is available
  const gitVersion = await gitSafe(".", ["--version"]);
  if (!gitVersion) {
    return; // no git — no-op
  }

  try {
    if (await isSubmodule(backlogDir)) {
      await commitSubmodule(backlogDir, operation);
    } else if (await isPlainRepo(backlogDir)) {
      await commitPlainRepo(backlogDir, operation);
    }
    // else: not in git — no-op
  } catch (err) {
    warn(`unexpected error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  commitBacklogChanges,
  isSubmodule,
  isPlainRepo,
};

// ---------------------------------------------------------------------------
// CLI mode — when run directly
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  __filename.replace(/\\/g, "/").endsWith(process.argv[1].replace(/\\/g, "/"));

if (isMain) {
  const autoCommit = (process.env.BACKLOG_AUTO_COMMIT || "true") !== "false";
  if (!autoCommit) process.exit(0);

  const operation = process.argv[2];
  if (!operation) {
    warn("usage: backlog-commit-hook.mjs <operation_description>");
    process.exit(1);
  }

  const backlogDir = process.env.BACKLOG_DIR;
  if (!backlogDir) {
    warn("BACKLOG_DIR not set — skipping commit");
    process.exit(1);
  }

  await commitBacklogChanges(backlogDir, operation);
}
