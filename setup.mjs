#!/usr/bin/env node

/**
 * setup.mjs — Cross-platform Node.js installer for backlog-setup.
 *
 * Cross-platform installer — works on Windows, macOS, and Linux.
 * Uses only node: built-in modules (no third-party dependencies).
 *
 * Usage:
 *   node setup.mjs [OPTIONS] [TARGET_DIR]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, cpSync, chmodSync, readdirSync, statSync, renameSync } from "node:fs";
import { join, basename, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import { getSharedDir, getSharedCacheDir, toForwardSlash, IS_WINDOWS } from "./lib/platform.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(__filename);
const REPO_RAW = "https://raw.githubusercontent.com/Hodnebo/backlog-setup/main";

const LIB_FILES = [
  "rag-server.mjs",
  "preprocessing.mjs",
  "exclusion.mjs",
  "discovery.mjs",
  "hashing.mjs",
  "ingestion.mjs",
  "workflow-guides.mjs",
  "backlog-proxy.mjs",
  "backlog-commit-hook.mjs",
  "platform.mjs",
];

const AGENTS_WORKFLOW = `
<!-- BACKLOG_WORKFLOW:BEGIN -->

## Backlog Workflow

Before starting any work:

1. Run \`backlog_task_list\` to see current tasks and their statuses
2. Check if the work you are about to do is already tracked as a task

While working:

- If no task exists for your work, create one with \`backlog_task_create\` and set status to "In Progress"
- If a task exists, move it to "In Progress" with \`backlog_task_edit\`
- Break large efforts into subtasks

After completing work:

- Use \`backlog_task_complete\` to mark the task as complete (do NOT use \`backlog_task_edit\` to set status to Done)
- Fill in the \`finalSummary\` with what changed and why

Use \`backlog_semantic_search\` for natural-language task discovery ("what needs performance work?") and \`backlog_task_search\` for exact lookups ("TASK-12", "authentication").
<!-- BACKLOG_WORKFLOW:END -->
`;

const GITIGNORE_ENTRIES = [
  "# MCP configs (contain machine-specific absolute paths)",
  ".mcp.json",
  "opencode.json",
  "",
  "# RAG vector database",
  ".lancedb/",
  "",
  "# RAG model cache",
  ".mcp-local-rag-models/",
  "",
  "# Node",
  "node_modules/",
  "",
  "# Backlog submodule bare repo (if using --submodule without remote)",
  ".backlog-repo.git",
];

const GITIGNORE_REQUIRED = [
  ".mcp.json",
  "opencode.json",
  ".lancedb/",
  ".mcp-local-rag-models/",
  "node_modules/",
  ".backlog-repo.git",
];

// ─────────────────────────────────────────────────────────────────────────────
// Logging (all to stderr)
// ─────────────────────────────────────────────────────────────────────────────

const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[1;33m";
const BLUE = "\x1b[0;34m";
const NC = "\x1b[0m";

function info(msg) {
  process.stderr.write(`${BLUE}[info]${NC} ${msg}\n`);
}

function ok(msg) {
  process.stderr.write(`${GREEN}[ok]${NC} ${msg}\n`);
}

function warn(msg) {
  process.stderr.write(`${YELLOW}[warn]${NC} ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`${RED}[error]${NC} ${msg}\n`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether an executable is available on PATH.
 * @param {string} name
 * @returns {boolean}
 */
function commandExists(name) {
  try {
    const cmd = IS_WINDOWS ? "where" : "which";
    execFileSync(cmd, [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a command and return trimmed stdout, or fallback on error.
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} [opts]
 * @returns {string}
 */
function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts }).trim();
  } catch {
    return opts.fallback !== undefined ? opts.fallback : "";
  }
}

/**
 * Run a command, ignoring output. Returns true if exit code 0.
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} [opts]
 * @returns {boolean}
 */
function runOk(cmd, args, opts = {}) {
  try {
    execFileSync(cmd, args, { stdio: "ignore", ...opts });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a command, printing output to stderr.
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} [opts]
 */
function runVerbose(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: ["inherit", "inherit", "inherit"], ...opts });
}

/**
 * Set file executable permission. No-op on Windows.
 * @param {string} filePath
 */
function chmodExecutable(filePath) {
  try {
    chmodSync(filePath, 0o755);
  } catch {
    // Windows: chmod not supported, ignore
  }
}

/**
 * Download a file via Node.js fetch (available in Node 18+).
 * @param {string} url
 * @param {string} dest
 * @returns {Promise<boolean>}
 */
async function downloadFile(url, dest) {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(dest, buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a directory is inside a git work tree.
 * @param {string} cwd
 * @returns {boolean}
 */
function isGitRepo(cwd) {
  return runOk("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
}

/**
 * Get git remote origin URL, or empty string.
 * @param {string} cwd
 * @returns {string}
 */
function gitRemoteUrl(cwd) {
  return run("git", ["remote", "get-url", "origin"], { cwd, fallback: "" });
}

/**
 * Detect project name from directory or git remote.
 * @param {string} targetDir
 * @returns {string}
 */
function detectProjectName(targetDir) {
  let name = basename(targetDir);
  if (isGitRepo(targetDir)) {
    const remoteUrl = gitRemoteUrl(targetDir);
    if (remoteUrl) {
      name = basename(remoteUrl, ".git");
    }
  }
  return name;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive prompts (node:readline)
// ─────────────────────────────────────────────────────────────────────────────

let rl = null;

function getReadline() {
  if (!rl) {
    rl = createInterface({ input: process.stdin, output: process.stderr });
  }
  return rl;
}

function closeReadline() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

/**
 * Prompt user for a line of input.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
function prompt(prompt) {
  return new Promise((resolve) => {
    getReadline().question(prompt, (answer) => resolve(answer));
  });
}

/**
 * Ask a yes/no question. Returns true for yes.
 * @param {string} question
 * @param {string} defaultVal - "y" or "n"
 * @param {boolean} interactive
 * @returns {Promise<boolean>}
 */
async function askYn(question, defaultVal, interactive) {
  if (!interactive) return defaultVal === "y";
  const suffix = defaultVal === "y" ? "[Y/n]" : "[y/N]";
  const answer = await prompt(`  ${question} ${suffix}: `);
  if (!answer.trim()) return defaultVal === "y";
  return /^[Yy]/.test(answer);
}

/**
 * Ask a multiple-choice question. Returns the choice string (e.g. "1", "2").
 * @param {string} question
 * @param {string} defaultVal
 * @param {string[]} options
 * @param {boolean} interactive
 * @returns {Promise<string>}
 */
async function askChoice(question, defaultVal, options, interactive) {
  if (!interactive) return defaultVal;
  process.stderr.write(`\n  ${BLUE}${question}${NC}\n`);
  for (let i = 0; i < options.length; i++) {
    process.stderr.write(`    ${i + 1}) ${options[i]}\n`);
  }
  const answer = await prompt(`  Choice [${defaultVal}]: `);
  return answer.trim() || defaultVal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────────────────────

let localCache = false;
let submoduleMode = false;
let backlogRemote = "";
let updateMode = false;
let interactive = true;
let autoCommit = true;
let editorConfig = "all";
let targetDir = "";

let flagLocalCache = false;
let flagSubmodule = false;

const USAGE = `Usage: node setup.mjs [OPTIONS] [TARGET_DIR]

Sets up an AI kanban board with semantic search in TARGET_DIR (default: current directory).

Options:
  --local-cache               Use a per-repo model cache instead of the shared
                              cache. The model (~90MB) will be stored in
                              TARGET_DIR/.mcp-local-rag-models.
  --submodule                 Initialize backlog/ as a git submodule instead of a
                              plain directory. Task commits stay in a separate repo.
  --backlog-remote <url>      Remote URL for the backlog submodule repo. Requires
                              --submodule. If omitted with --submodule, a local
                              repo is created (add remote later).
  --update                    Refresh MCP configs and AGENTS.md workflow section
                              from latest templates.
  --yes, -y                   Skip interactive prompts and use defaults.
                              Also activates automatically when stdin is not a terminal.
  --help                      Show this help message and exit.
`;

function parseArgs(argv) {
  const args = argv.slice(2);
  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      case "--local-cache":
        localCache = true;
        flagLocalCache = true;
        break;
      case "--submodule":
        submoduleMode = true;
        flagSubmodule = true;
        break;
      case "--yes":
      case "-y":
        interactive = false;
        break;
      case "--backlog-remote":
        i++;
        if (i >= args.length || !args[i]) {
          fail("--backlog-remote requires a URL argument");
        }
        backlogRemote = args[i];
        break;
      case "--update":
        updateMode = true;
        break;
      case "--help":
      case "-h":
        process.stderr.write(USAGE);
        process.exit(0);
        break;
      default:
        if (args[i].startsWith("-")) {
          fail(`Unknown option: ${args[i]} (see --help)`);
        }
        targetDir = args[i];
        break;
    }
    i++;
  }
}

parseArgs(process.argv);

if (backlogRemote && !submoduleMode) {
  fail("--backlog-remote requires --submodule");
}

if (submoduleMode && !commandExists("git")) {
  fail("--submodule requires git but git is not installed");
}

if (submoduleMode) {
  info("Submodule mode enabled");
}

// Fall back to non-interactive when stdin is not a terminal
if (interactive && !process.stdin.isTTY) {
  interactive = false;
}

targetDir = resolve(targetDir || process.cwd());

// Detect self-install (running setup.mjs inside its own repo)
const SELF_INSTALL = SCRIPT_DIR === targetDir;

const SHARED_DIR = getSharedDir();
const SHARED_CACHE = getSharedCacheDir();
const LOCAL_CACHE_DIR = join(targetDir, ".mcp-local-rag-models");

function getCacheDirValue() {
  return localCache ? LOCAL_CACHE_DIR : SHARED_CACHE;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight checks
// ─────────────────────────────────────────────────────────────────────────────

info(`Setting up AI kanban in: ${targetDir}`);
process.stderr.write("\n");

// Check Node.js
if (!commandExists("node")) {
  fail("Node.js is required but not installed. Install from https://nodejs.org");
}

const nodeVersionRaw = run("node", ["-v"]);
const nodeVersionMajor = parseInt(nodeVersionRaw.replace(/^v/, "").split(".")[0], 10);
if (nodeVersionMajor < 18) {
  fail(`Node.js 18+ required (found ${nodeVersionRaw})`);
}
ok(`Node.js ${nodeVersionRaw}`);

// Check npm
if (!commandExists("npm")) {
  fail("npm is required but not found");
}
ok(`npm ${run("npm", ["-v"])}`);

// Check backlog.md
if (!commandExists("backlog")) {
  info("Installing backlog.md globally...");
  runVerbose("npm", ["install", "-g", "backlog.md"]);
}
const backlogVersion = run("backlog", ["--version"], { fallback: "installed" });
ok(`backlog.md ${backlogVersion}`);

process.stderr.write("\n");

// ─────────────────────────────────────────────────────────────────────────────
// Configuration wizard (interactive mode)
// ─────────────────────────────────────────────────────────────────────────────

if (interactive) {
  const bar = `${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`;
  process.stderr.write(`${bar}\n${BLUE} Configuration${NC}\n${bar}\n`);

  if (!flagLocalCache) {
    const choice = await askChoice("Model cache location:", "1", [
      "Shared (~/.mcp-local-rag-models) — one download, shared across repos",
      "Per-repo (.mcp-local-rag-models/) — isolated, uses more disk",
    ], interactive);
    if (choice === "2") localCache = true;
  }

  if (!flagSubmodule) {
    const choice = await askChoice("Backlog storage mode:", "1", [
      "Plain directory — tracked in project git",
      "Git submodule — separate repo for task history",
    ], interactive);
    if (choice === "2") submoduleMode = true;
  }

  if (submoduleMode && !backlogRemote) {
    process.stderr.write(`\n  ${BLUE}Backlog remote URL (leave empty for local-only):${NC}\n`);
    backlogRemote = (await prompt("  URL: ")).trim();
  }

  autoCommit = await askYn("Auto-commit task changes?", "y", interactive);

  const edChoice = await askChoice("Editor configs to generate:", "1", [
    "All — OpenCode + Claude Code / Cursor",
    "OpenCode only",
    "Claude Code / Cursor only (.mcp.json)",
  ], interactive);
  if (edChoice === "2") editorConfig = "opencode";
  else if (edChoice === "3") editorConfig = "claude";
  else editorConfig = "all";

  process.stderr.write(`\n${bar}\n${BLUE} Summary${NC}\n${bar}\n\n`);
  process.stderr.write(`  Target:      ${targetDir}\n`);
  if (localCache) {
    process.stderr.write("  Cache:       Per-repo (.mcp-local-rag-models/)\n");
  } else {
    process.stderr.write("  Cache:       Shared (~/.mcp-local-rag-models)\n");
  }
  if (submoduleMode) {
    if (backlogRemote) {
      process.stderr.write(`  Storage:     Git submodule (${backlogRemote})\n`);
    } else {
      process.stderr.write("  Storage:     Git submodule (local)\n");
    }
  } else {
    process.stderr.write("  Storage:     Plain directory\n");
  }
  process.stderr.write(autoCommit ? "  Auto-commit: Enabled\n" : "  Auto-commit: Disabled\n");
  const edLabel = { all: "All (OpenCode + Claude Code / Cursor)", opencode: "OpenCode only", claude: "Claude Code / Cursor only" }[editorConfig];
  process.stderr.write(`  Editors:     ${edLabel}\n\n`);

  const proceed = await askYn("Proceed?", "y", interactive);
  if (!proceed) {
    process.stderr.write("Aborted.\n");
    closeReadline();
    process.exit(0);
  }
  process.stderr.write("\n");
  closeReadline();
}

const CACHE_DIR_VALUE = getCacheDirValue();

// ─────────────────────────────────────────────────────────────────────────────
// Initialize backlog (if not already)
// ─────────────────────────────────────────────────────────────────────────────

const backlogDir = join(targetDir, "backlog");

if (existsSync(join(backlogDir, "config.yml"))) {
  ok("Backlog already initialized");
} else if (submoduleMode && backlogRemote && !existsSync(backlogDir)) {
  info("Deferring backlog init (submodule with remote — will clone first)");
} else {
  info("Initializing backlog...");
  const projectName = detectProjectName(targetDir);
  runOk("backlog", ["init", projectName, "--integration-mode", "mcp", "--defaults"], { cwd: targetDir });

  if (!gitRemoteUrl(targetDir)) {
    runOk("backlog", ["config", "set", "remoteOperations", "false"], { cwd: targetDir });
  }

  ok(`Backlog initialized as '${projectName}'`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Submodule mode: wire backlog/ as a git submodule
// ─────────────────────────────────────────────────────────────────────────────

if (submoduleMode) {
  if (!isGitRepo(targetDir)) {
    fail("--submodule requires TARGET_DIR to be a git repository");
  }

  // Case A: backlog/ is already a submodule
  if (runOk("git", ["submodule", "status", "backlog"], { cwd: targetDir })) {
    ok("backlog/ is already a submodule");

  // Case B: .gitmodules lists backlog but it is not initialized
  } else if (
    existsSync(join(targetDir, ".gitmodules")) &&
    readFileSync(join(targetDir, ".gitmodules"), "utf8").includes("path = backlog")
  ) {
    info("Initializing backlog submodule from .gitmodules...");
    runVerbose("git", ["submodule", "update", "--init", "backlog"], { cwd: targetDir });
    ok("backlog submodule initialized");

  // Case C: backlog/ exists as a plain directory (no .git inside)
  } else if (existsSync(backlogDir) && !existsSync(join(backlogDir, ".git"))) {
    info("Converting existing backlog/ to a submodule...");
    runOk("git", ["rm", "-r", "--cached", "backlog"], { cwd: targetDir });

    if (backlogRemote) {
      const backlogTmp = mkdtempSync(join(tmpdir(), "backlog-"));
      cpSync(backlogDir, backlogTmp, { recursive: true });
      rmSync(backlogDir, { recursive: true, force: true });
      runVerbose("git", ["submodule", "add", backlogRemote, "backlog"], { cwd: targetDir });

      // Merge local content into the submodule
      cpSync(backlogTmp, backlogDir, { recursive: true });
      rmSync(backlogTmp, { recursive: true, force: true });

      // Commit and push inside the submodule
      runOk("git", ["-C", backlogDir, "add", "-A"]);
      const hasCached = run("git", ["-C", backlogDir, "diff", "--cached", "--quiet"], { fallback: "changed" });
      if (hasCached === "changed") {
        runOk("git", ["-C", backlogDir, "commit", "-q", "-m", "Add backlog content from parent project"]);
        const branch = run("git", ["-C", backlogDir, "branch", "--show-current"]);
        if (!runOk("git", ["-C", backlogDir, "push", "origin", branch])) {
          warn(`Could not push to ${backlogRemote} — push manually later`);
        }
      }
    } else {
      const bareRepo = join(targetDir, ".backlog-repo.git");
      runOk("git", ["-C", backlogDir, "init", "-q"]);
      runOk("git", ["-C", backlogDir, "add", "-A"]);
      runOk("git", ["-C", backlogDir, "commit", "-q", "-m", "Initial backlog content"]);
      runOk("git", ["clone", "--bare", "-q", backlogDir, bareRepo]);
      rmSync(backlogDir, { recursive: true, force: true });
      runVerbose("git", ["submodule", "add", bareRepo, "backlog"], { cwd: targetDir });
      info("Local bare repo created at .backlog-repo.git — add a real remote later:");
      info("  cd backlog && git remote set-url origin <url> && git push -u origin main");
    }

    ok("backlog/ converted to submodule");

  // Case D: backlog/ has .git (standalone repo) — wire as submodule
  } else if (existsSync(join(backlogDir, ".git"))) {
    const existingRemote = gitRemoteUrl(backlogDir);
    let submoduleUrl = backlogRemote || existingRemote;

    if (!submoduleUrl) {
      const bareRepo = join(targetDir, ".backlog-repo.git");
      runOk("git", ["clone", "--bare", "-q", backlogDir, bareRepo]);
      submoduleUrl = bareRepo;
      info("Local bare repo created at .backlog-repo.git");
    }

    rmSync(backlogDir, { recursive: true, force: true });
    runOk("git", ["rm", "-r", "--cached", "backlog"], { cwd: targetDir });
    runVerbose("git", ["submodule", "add", submoduleUrl, "backlog"], { cwd: targetDir });
    ok(`backlog/ wired as submodule from ${submoduleUrl}`);

  // Case E: fresh setup — add submodule from scratch
  } else {
    if (backlogRemote) {
      runVerbose("git", ["submodule", "add", backlogRemote, "backlog"], { cwd: targetDir });
      ok(`backlog submodule added from ${backlogRemote}`);
    } else {
      fail("backlog/ does not exist and no --backlog-remote provided. Run without --submodule first, or provide a remote.");
    }
  }

  // After submodule setup, ensure backlog is initialized inside it
  if (!existsSync(join(backlogDir, "config.yml"))) {
    info("Initializing backlog inside submodule...");
    const projectName = detectProjectName(targetDir);
    runOk("backlog", ["init", projectName, "--integration-mode", "mcp", "--defaults"], { cwd: targetDir });

    if (!gitRemoteUrl(targetDir)) {
      runOk("backlog", ["config", "set", "remoteOperations", "false"], { cwd: targetDir });
    }

    // Commit and push inside the submodule
    runOk("git", ["-C", backlogDir, "add", "-A"]);
    const hasCached = run("git", ["-C", backlogDir, "diff", "--cached", "--quiet"], { fallback: "changed" });
    if (hasCached === "changed") {
      runOk("git", ["-C", backlogDir, "commit", "-q", "-m", "Initialize backlog"]);
      const branch = run("git", ["-C", backlogDir, "branch", "--show-current"]);
      if (!runOk("git", ["-C", backlogDir, "push", "origin", branch])) {
        warn("Could not push backlog init to remote — push manually later");
      }
    }

    ok(`Backlog initialized inside submodule as '${projectName}'`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Install shared components
// ─────────────────────────────────────────────────────────────────────────────

const libSrcDir = join(SCRIPT_DIR, "lib");

info(`Shared install location: ${SHARED_DIR}`);

// -- lib/ modules -----------------------------------------------------------

const sharedLibDir = join(SHARED_DIR, "lib");
mkdirSync(sharedLibDir, { recursive: true });

if (existsSync(libSrcDir)) {
  for (const f of LIB_FILES) {
    const src = join(libSrcDir, f);
    if (existsSync(src)) {
      cpSync(src, join(sharedLibDir, f));
    } else {
      warn(`lib/${f} not found locally — skipping`);
    }
  }
} else {
  info("lib/ not found locally — downloading from GitHub...");
  for (const f of LIB_FILES) {
    const downloaded = await downloadFile(`${REPO_RAW}/lib/${f}`, join(sharedLibDir, f));
    if (!downloaded) {
      fail(`Could not download lib/${f}. Run setup from the cloned repo instead.`);
    }
  }
}
ok(`lib/ modules installed to shared location (${LIB_FILES.length} files)`);

// -- mcp-local-rag dependency (shared) --------------------------------------

const mcpLocalRagPkg = join(SHARED_DIR, "node_modules", "mcp-local-rag", "package.json");

if (updateMode || !existsSync(mcpLocalRagPkg)) {
  info("Installing mcp-local-rag to shared location...");
  if (!existsSync(join(SHARED_DIR, "package.json"))) {
    runOk("npm", ["init", "-y", "--silent"], { cwd: SHARED_DIR });
  }
  runVerbose("npm", ["install", "mcp-local-rag", "--save", "--silent"], { cwd: SHARED_DIR });
  ok("mcp-local-rag installed (shared)");
} else {
  ok("mcp-local-rag already installed (shared)");
}

// ─────────────────────────────────────────────────────────────────────────────
// Migrate per-project copies to shared location
// ─────────────────────────────────────────────────────────────────────────────

let migrationDone = false;

if (!SELF_INSTALL && existsSync(join(targetDir, "lib", "rag-server.mjs"))) {
  info("Migrating from per-project lib/ to shared location...");
  rmSync(join(targetDir, "lib"), { recursive: true, force: true });
  ok(`Removed ${targetDir}/lib/ (now at ${SHARED_DIR}/lib/)`);
  migrationDone = true;
}

if (!SELF_INSTALL && existsSync(join(targetDir, "node_modules", "mcp-local-rag"))) {
  info("Removing per-project mcp-local-rag (now in shared location)...");
  runOk("npm", ["uninstall", "mcp-local-rag", "--save", "--silent"], { cwd: targetDir });
  ok("Removed per-project mcp-local-rag dependency");
  migrationDone = true;
}

if (migrationDone) {
  updateMode = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Install backlog semantic search skill (OpenCode)
// ─────────────────────────────────────────────────────────────────────────────

if (editorConfig === "all" || editorConfig === "opencode") {
  const skillSrc = join(SCRIPT_DIR, "skills", "backlog-semantic-search.md");
  const skillDest = join(targetDir, ".opencode", "skills", "backlog-semantic-search.md");

  if (SELF_INSTALL) {
    ok("Skill already in place (self-install)");
  } else if (existsSync(skillSrc)) {
    mkdirSync(dirname(skillDest), { recursive: true });
    cpSync(skillSrc, skillDest);
    ok("Backlog semantic search skill installed (.opencode/skills/)");
  } else {
    mkdirSync(dirname(skillDest), { recursive: true });
    const downloaded = await downloadFile(`${REPO_RAW}/skills/backlog-semantic-search.md`, skillDest);
    if (downloaded) {
      ok("Backlog semantic search skill installed (.opencode/skills/)");
    } else {
      warn("Could not download backlog-semantic-search.md — skipping skill install");
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Write MCP configs
// ─────────────────────────────────────────────────────────────────────────────

// All paths in MCP JSON must use forward slashes
const fwdSharedDir = toForwardSlash(SHARED_DIR);
const fwdTargetDir = toForwardSlash(targetDir);
const fwdCacheDirValue = toForwardSlash(CACHE_DIR_VALUE);

// -- .mcp.json (Claude Code / Cursor) ----------------------------------------

if (editorConfig === "all" || editorConfig === "claude") {
  const mcpJsonPath = join(targetDir, ".mcp.json");

  if (existsSync(mcpJsonPath) && !updateMode) {
    warn(".mcp.json already exists — skipping (use --update to refresh)");
  } else {
    const ragEnv = {
      BASE_DIR: `${fwdTargetDir}/backlog`,
      DB_PATH: `${fwdTargetDir}/.lancedb`,
      CACHE_DIR: fwdCacheDirValue,
    };
    if (!autoCommit) {
      ragEnv.BACKLOG_AUTO_COMMIT = "false";
    }

    const backlogMcpServers = {
      backlog: {
        command: "node",
        args: [`${fwdSharedDir}/lib/backlog-proxy.mjs`],
        env: {
          BACKLOG_CWD: fwdTargetDir,
        },
      },
      "backlog-rag": {
        command: "node",
        args: [`${fwdSharedDir}/lib/rag-server.mjs`],
        env: ragEnv,
      },
    };

    if (existsSync(mcpJsonPath)) {
      const existing = JSON.parse(readFileSync(mcpJsonPath, "utf8"));
      existing.mcpServers = { ...existing.mcpServers, ...backlogMcpServers };
      writeFileSync(mcpJsonPath, JSON.stringify(existing, null, 2) + "\n");
      info("Merged backlog servers into existing .mcp.json");
    } else {
      const mcpDoc = { mcpServers: backlogMcpServers };
      writeFileSync(mcpJsonPath, JSON.stringify(mcpDoc, null, 2) + "\n");
    }
    ok(".mcp.json created (Claude Code / Cursor)");
  }
}

// -- opencode.json (OpenCode) ------------------------------------------------

if (editorConfig === "all" || editorConfig === "opencode") {
  const ocJsonPath = join(targetDir, "opencode.json");

  if (existsSync(ocJsonPath) && !updateMode) {
    warn("opencode.json already exists — skipping (use --update to refresh)");
  } else {
    const ocRagEnv = {
      BASE_DIR: `${fwdTargetDir}/backlog`,
      DB_PATH: `${fwdTargetDir}/.lancedb`,
      CACHE_DIR: fwdCacheDirValue,
    };
    if (!autoCommit) {
      ocRagEnv.BACKLOG_AUTO_COMMIT = "false";
    }

    const backlogOcServers = {
      backlog: {
        type: "local",
        command: ["node", `${fwdSharedDir}/lib/backlog-proxy.mjs`],
        environment: {
          BACKLOG_CWD: fwdTargetDir,
        },
        enabled: true,
      },
      "backlog-rag": {
        type: "local",
        command: ["node", `${fwdSharedDir}/lib/rag-server.mjs`],
        environment: ocRagEnv,
        enabled: true,
      },
    };

    if (existsSync(ocJsonPath)) {
      const existing = JSON.parse(readFileSync(ocJsonPath, "utf8"));
      existing.mcp = { ...existing.mcp, ...backlogOcServers };
      writeFileSync(ocJsonPath, JSON.stringify(existing, null, 2) + "\n");
      info("Merged backlog servers into existing opencode.json");
    } else {
      const ocDoc = {
        $schema: "https://opencode.ai/config.json",
        mcp: backlogOcServers,
      };
      writeFileSync(ocJsonPath, JSON.stringify(ocDoc, null, 2) + "\n");
    }
    ok("opencode.json created (OpenCode)");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Update .gitignore
// ─────────────────────────────────────────────────────────────────────────────

const gitignorePath = join(targetDir, ".gitignore");

if (existsSync(gitignorePath)) {
  let content = readFileSync(gitignorePath, "utf8");
  let added = false;
  for (const entry of GITIGNORE_REQUIRED) {
    if (!content.includes(entry)) {
      content += `\n${entry}`;
      added = true;
    }
  }
  if (added) {
    writeFileSync(gitignorePath, content);
    ok(".gitignore updated");
  } else {
    ok(".gitignore already has required entries");
  }
} else {
  writeFileSync(gitignorePath, GITIGNORE_ENTRIES.join("\n") + "\n");
  ok(".gitignore created");
}

// ─────────────────────────────────────────────────────────────────────────────
// Append backlog workflow to AGENTS.md
// ─────────────────────────────────────────────────────────────────────────────

const agentsPath = join(targetDir, "AGENTS.md");
const AGENTS_MARKER = "<!-- BACKLOG_WORKFLOW:BEGIN -->";
const AGENTS_MARKER_END = "<!-- BACKLOG_WORKFLOW:END -->";

// If --update, remove old Backlog Workflow section
if (updateMode && existsSync(agentsPath)) {
  let content = readFileSync(agentsPath, "utf8");
  if (content.includes(AGENTS_MARKER)) {
    const startIdx = content.indexOf(AGENTS_MARKER);
    const endIdx = content.indexOf(AGENTS_MARKER_END);
    if (endIdx !== -1) {
      content = content.slice(0, startIdx) + content.slice(endIdx + AGENTS_MARKER_END.length);
      // Trim trailing blank lines
      content = content.replace(/\n{3,}$/g, "\n");
      writeFileSync(agentsPath, content);
      info("Removed old Backlog Workflow section from AGENTS.md");
    }
  }
}

if (existsSync(agentsPath)) {
  const content = readFileSync(agentsPath, "utf8");
  if (content.includes(AGENTS_MARKER)) {
    ok("AGENTS.md already has backlog workflow section");
  } else {
    writeFileSync(agentsPath, content + AGENTS_WORKFLOW);
    ok("AGENTS.md updated with backlog workflow");
  }
} else {
  writeFileSync(agentsPath, AGENTS_WORKFLOW);
  ok("AGENTS.md created with backlog workflow");
}

// ─────────────────────────────────────────────────────────────────────────────
// Migrate per-repo model cache to shared cache (if applicable)
// ─────────────────────────────────────────────────────────────────────────────

if (!localCache && existsSync(join(LOCAL_CACHE_DIR, "Xenova"))) {
  if (!existsSync(join(SHARED_CACHE, "Xenova"))) {
    info(`Moving per-repo model cache to shared location (${SHARED_CACHE})...`);
    mkdirSync(SHARED_CACHE, { recursive: true });
    try {
      const entries = readdirSync(LOCAL_CACHE_DIR);
      for (const entry of entries) {
        const src = join(LOCAL_CACHE_DIR, entry);
        const dest = join(SHARED_CACHE, entry);
        renameSync(src, dest);
      }
      rmSync(LOCAL_CACHE_DIR, { recursive: true, force: true });
    } catch {
      // Fallback: copy + remove
      cpSync(LOCAL_CACHE_DIR, SHARED_CACHE, { recursive: true });
      rmSync(LOCAL_CACHE_DIR, { recursive: true, force: true });
    }
    ok(`Model cache migrated to ${SHARED_CACHE} (saved ~90MB in this repo)`);
  } else {
    info("Removing redundant per-repo model cache (shared cache already exists)...");
    rmSync(LOCAL_CACHE_DIR, { recursive: true, force: true });
    ok(`Per-repo cache removed (shared cache at ${SHARED_CACHE})`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-download embedding model (so first MCP startup is fast)
// ─────────────────────────────────────────────────────────────────────────────

if (existsSync(join(CACHE_DIR_VALUE, "Xenova"))) {
  ok(`Embedding model already cached (${CACHE_DIR_VALUE})`);
} else {
  info(`Pre-downloading embedding model (~90MB, one-time) to ${CACHE_DIR_VALUE}...`);
  const predownloadScript = `
    import('mcp-local-rag/dist/server/index.js').then(async ({ RAGServer }) => {
      const s = new RAGServer({
        dbPath: ${JSON.stringify(toForwardSlash(join(targetDir, ".lancedb")))},
        modelName: 'Xenova/all-MiniLM-L6-v2',
        cacheDir: ${JSON.stringify(toForwardSlash(CACHE_DIR_VALUE))},
        baseDir: ${JSON.stringify(toForwardSlash(join(targetDir, "backlog")))},
        maxFileSize: 104857600,
      });
      await s.initialize();
      console.log('Model cache ready');
      process.exit(0);
    }).catch(e => { console.error(e.message); process.exit(0); });
  `;
  try {
    execFileSync("node", ["-e", predownloadScript], {
      cwd: SHARED_DIR,
      env: {
        ...process.env,
        BASE_DIR: join(targetDir, "backlog"),
        DB_PATH: join(targetDir, ".lancedb"),
        CACHE_DIR: CACHE_DIR_VALUE,
      },
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 120000,
    });
    ok(`Embedding model cached at ${CACHE_DIR_VALUE}`);
  } catch {
    warn("Model pre-download skipped (will download on first use)");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Done
// ─────────────────────────────────────────────────────────────────────────────

process.stderr.write(`
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${GREEN} AI Kanban Board ready!${NC}
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

  Files created:
    backlog/                 — kanban board data (tasks, docs, milestones)
`);
if (editorConfig === "all" || editorConfig === "claude") {
  process.stderr.write("    .mcp.json                — MCP config for Claude Code / Cursor\n");
}
if (editorConfig === "all" || editorConfig === "opencode") {
  process.stderr.write("    opencode.json            — MCP config for OpenCode\n");
}
process.stderr.write(`
  Shared install (${SHARED_DIR}):
    lib/                     — modular RAG server (${LIB_FILES.length} modules)
    node_modules/            — mcp-local-rag dependency
`);
if (submoduleMode) {
  process.stderr.write(`
  Submodule mode:
    backlog/ is a git submodule — task commits stay in a separate repo
    Commit workflow: cd backlog && git add -A && git commit && git push
`);
}
process.stderr.write(`
  Quick start:
    backlog board              — view kanban in terminal
    backlog browser            — open web UI (localhost:6420)
    backlog task create "Do X" — create a task

  MCP servers (auto-start in your AI editor):
    backlog     — 22 tools for task management
    backlog-rag — semantic search (auto-ingests on startup)
`);
if (editorConfig === "all" || editorConfig === "opencode") {
  process.stderr.write(`
  Installed skill:
    .opencode/skills/backlog-semantic-search.md
`);
}
process.stderr.write(`
  The RAG index syncs automatically every time your AI
  editor opens this repo. No manual steps needed.

`);
if (autoCommit) {
  process.stderr.write(`  Auto-commit: task changes are committed automatically.
  Disable with: BACKLOG_AUTO_COMMIT=false
`);
} else {
  process.stderr.write(`  Auto-commit: disabled.
  Enable with: BACKLOG_AUTO_COMMIT=true in your MCP config env
`);
}
process.stderr.write("\n");
