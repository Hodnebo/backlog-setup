/**
 * Directory and file exclusion logic — glob-to-regex conversion and path matching.
 *
 * Handles gitignore-style patterns with *, **, ?, anchored (/), and trailing-slash
 * semantics. Loads patterns from defaults, EXCLUDE_PATTERNS env var, and .ragignore.
 *
 * Pure functions except loadExcludePatterns() which reads env and filesystem.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Default exclusion patterns (always active)
// ---------------------------------------------------------------------------

const DEFAULT_EXCLUDE_PATTERNS = [
  ".git",
  "node_modules",
  ".lancedb",
  ".mcp-local-rag-models",
  ".DS_Store",
  ".opencode",
  "completed",
  "archive",
];

// ---------------------------------------------------------------------------
// Glob-to-regex conversion
// ---------------------------------------------------------------------------

/**
 * Escape special regex characters in a string.
 *
 * @param {string} s — raw string
 * @returns {string}
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Convert a gitignore-style glob pattern to a RegExp.
 *
 * Supported syntax:
 *   - `*`    matches any characters except path separators
 *   - `**`   matches any characters including path separators (directory wildcard)
 *   - `?`    matches a single non-separator character
 *   - Bare names like `node_modules` match as a path segment anywhere
 *   - Patterns starting with `/` are anchored to BASE_DIR root
 *   - Trailing `/` forces directory-only matching (stripped before conversion)
 *
 * @param {string} pattern — gitignore-style glob
 * @returns {RegExp}
 */
function globToRegex(pattern) {
  let anchored = false;
  let p = pattern;

  // Leading `/` anchors to the root of the scanned tree
  if (p.startsWith("/")) {
    anchored = true;
    p = p.slice(1);
  }

  // Trailing `/` means directory-only — semantically we just strip it
  // because we check directories by name before recursing
  if (p.endsWith("/")) {
    p = p.slice(0, -1);
  }

  // If the pattern has no slashes and no glob chars, it's a bare name —
  // match it as a path segment anywhere: (^|/)name($|/)
  const hasSlash = p.includes("/");
  const hasGlob = /[*?]/.test(p);

  if (!hasSlash && !hasGlob) {
    const escaped = escapeRegex(p);
    if (anchored) {
      // Anchored bare name (e.g. /dist) — match only at path root
      return new RegExp("^" + escaped + "($|/)");
    }
    // Non-anchored bare name — match as exact segment anywhere in the path
    return new RegExp("(^|/)" + escaped + "($|/)");
  }

  // Convert glob to regex
  let regex = "";
  let i = 0;
  while (i < p.length) {
    if (p[i] === "*" && p[i + 1] === "*") {
      // `**` — match everything (including separators)
      regex += ".*";
      i += 2;
      // Skip a following `/` (e.g., `**/foo` → match foo at any depth)
      if (p[i] === "/") i++;
    } else if (p[i] === "*") {
      // `*` — match non-separator chars
      regex += "[^/]*";
      i++;
    } else if (p[i] === "?") {
      regex += "[^/]";
      i++;
    } else {
      regex += escapeRegex(p[i]);
      i++;
    }
  }

  if (anchored || hasSlash) {
    // Anchored or path-containing patterns match from the start of the relative path
    return new RegExp("^" + regex + "($|/)");
  }
  // Unanchored glob patterns match anywhere
  return new RegExp("(^|/)" + regex + "($|/)");
}

/**
 * Check if a relative path should be excluded given compiled matchers.
 *
 * @param {string} relativePath — forward-slash separated path relative to BASE_DIR
 * @param {RegExp[]} matchers — compiled exclusion patterns
 * @returns {boolean}
 */
function isExcluded(relativePath, matchers) {
  for (const re of matchers) {
    if (re.test(relativePath)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Pattern loading (reads env + filesystem)
// ---------------------------------------------------------------------------

/**
 * Load exclusion patterns from:
 *   1. DEFAULT_EXCLUDE_PATTERNS (always included)
 *   2. EXCLUDE_PATTERNS env var (comma-separated)
 *   3. .ragignore file in baseDir (one pattern per line, # comments, blank lines ignored)
 *
 * Returns an array of compiled RegExp matchers.
 *
 * @param {string} baseDir — directory to look for .ragignore
 * @returns {RegExp[]}
 */
function loadExcludePatterns(baseDir) {
  const raw = [...DEFAULT_EXCLUDE_PATTERNS];

  // Env var patterns
  const envPatterns = process.env.EXCLUDE_PATTERNS;
  if (envPatterns) {
    for (const p of envPatterns.split(",")) {
      const trimmed = p.trim();
      if (trimmed) raw.push(trimmed);
    }
  }

  // .ragignore file
  const ragignorePath = join(baseDir, ".ragignore");
  if (existsSync(ragignorePath)) {
    try {
      const content = readFileSync(ragignorePath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (trimmed && !trimmed.startsWith("#")) {
          raw.push(trimmed);
        }
      }
    } catch {
      // .ragignore unreadable — skip
    }
  }

  return raw.map(globToRegex);
}

export {
  DEFAULT_EXCLUDE_PATTERNS,
  escapeRegex,
  globToRegex,
  isExcluded,
  loadExcludePatterns,
};
