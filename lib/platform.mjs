/**
 * Platform helpers — cross-platform path and directory utilities.
 *
 * Provides platform-aware shared install directory, model cache directory,
 * and temp directory paths. On Windows, uses %LOCALAPPDATA%; on Unix,
 * uses ~/.local/share.
 *
 * Pure functions, no side effects.
 */

import { join } from "node:path";
import { homedir, tmpdir, platform } from "node:os";

const IS_WINDOWS = platform() === "win32";

// ---------------------------------------------------------------------------
// Shared install directory
// ---------------------------------------------------------------------------

/**
 * Get the platform-appropriate shared install directory for backlog-setup.
 *
 * - Windows: %LOCALAPPDATA%\backlog-setup  (e.g. C:\Users\X\AppData\Local\backlog-setup)
 * - macOS/Linux: ~/.local/share/backlog-setup
 *
 * @returns {string}
 */
function getSharedDir() {
  if (IS_WINDOWS) {
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    return join(localAppData, "backlog-setup");
  }
  return join(homedir(), ".local", "share", "backlog-setup");
}

// ---------------------------------------------------------------------------
// Model cache directory
// ---------------------------------------------------------------------------

/**
 * Get the platform-appropriate shared model cache directory.
 *
 * - Windows: %LOCALAPPDATA%\mcp-local-rag-models
 * - macOS/Linux: ~/.mcp-local-rag-models
 *
 * @returns {string}
 */
function getSharedCacheDir() {
  if (IS_WINDOWS) {
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    return join(localAppData, "mcp-local-rag-models");
  }
  return join(homedir(), ".mcp-local-rag-models");
}

// ---------------------------------------------------------------------------
// Temporary directory
// ---------------------------------------------------------------------------

/**
 * Get a cross-platform temp directory for transient operations.
 *
 * Uses os.tmpdir() which works on all platforms.
 *
 * @returns {string}
 */
function getTempDir() {
  return tmpdir();
}

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

/**
 * Convert a path to forward slashes for use in JSON configs and URLs.
 *
 * MCP config files (JSON) should use forward slashes on all platforms
 * since Node.js accepts them universally.
 *
 * @param {string} p — path string
 * @returns {string}
 */
function toForwardSlash(p) {
  return p.replace(/\\/g, "/");
}

export {
  IS_WINDOWS,
  getSharedDir,
  getSharedCacheDir,
  getTempDir,
  toForwardSlash,
};
