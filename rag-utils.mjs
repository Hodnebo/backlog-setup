/**
 * Pure utility functions extracted from rag-server.mjs for testability.
 *
 * Contains: glob-to-regex conversion, path exclusion logic, backlog task
 * detection and preprocessing. No side effects, no I/O, no dependencies
 * beyond Node.js built-ins.
 */

// ---------------------------------------------------------------------------
// Directory / file exclusion patterns
// ---------------------------------------------------------------------------

const DEFAULT_EXCLUDE_PATTERNS = [
  ".git",
  "node_modules",
  ".lancedb",
  ".mcp-local-rag-models",
  ".DS_Store",
  ".opencode",
];

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
    // Bare name — match as exact segment anywhere in the path
    return new RegExp("(^|/)" + escapeRegex(p) + "($|/)");
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
// Backlog task pre-processing
// ---------------------------------------------------------------------------

const MIN_CHUNK_LENGTH = 50;

/**
 * Detect whether a file is a backlog task (YAML frontmatter with id/title/status).
 *
 * @param {string} content — raw file content
 * @returns {boolean}
 */
function isBacklogTask(content) {
  return /^---\n[\s\S]*?\n---/.test(content) && /^id:\s/m.test(content) && /^title:\s/m.test(content);
}

/**
 * Parse a backlog .md task file into clean, embedding-friendly text.
 *
 * Strips YAML frontmatter noise (dates, ordinals, empty arrays) and HTML
 * section markers, then builds: "title; labels: x, y; priority: z; <description>"
 *
 * If the result is shorter than MIN_CHUNK_LENGTH, the title is repeated to pad it.
 *
 * @param {string} content — raw file content
 * @returns {string|null}
 */
function preprocessBacklogTask(content) {
  // --- Extract frontmatter fields ---
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const fm = fmMatch[1];
  const get = (key) => {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return m ? m[1].replace(/^['"]|['"]$/g, "").trim() : null;
  };

  const title = get("title");
  if (!title) return null;

  const priority = get("priority");

  // Labels can be YAML list (indented "- foo") or inline
  const labels = [];
  const labelsBlock = fm.match(/^labels:\n((?:\s+-\s+.+\n?)*)/m);
  if (labelsBlock) {
    for (const lm of labelsBlock[1].matchAll(/^\s+-\s+(.+)$/gm)) {
      labels.push(lm[1].trim());
    }
  }

  // --- Extract description (between section markers or after frontmatter) ---
  const body = content.slice(fmMatch[0].length);
  let description = "";
  const sectionMatch = body.match(
    /<!--\s*SECTION:DESCRIPTION:BEGIN\s*-->([\s\S]*?)<!--\s*SECTION:DESCRIPTION:END\s*-->/
  );
  if (sectionMatch) {
    description = sectionMatch[1].trim();
  } else {
    // Fallback: strip markdown headings and take whatever text remains
    description = body
      .replace(/^##?\s+.*/gm, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
  }

  // --- Assemble clean text ---
  // IMPORTANT: Use semicolons (not periods) as separators. The mcp-local-rag
  // SemanticChunker uses Intl.Segmenter which splits on periods, creating many
  // tiny sentences that individually fall below the 50-char minChunkLength
  // threshold and get filtered out — resulting in 0 chunks.
  // Semicolons keep everything as one "sentence" for the chunker.
  const parts = [title];
  if (labels.length > 0) parts.push(`labels: ${labels.join(", ")}`);
  if (priority) parts.push(`priority: ${priority}`);
  if (description) {
    // Replace sentence-ending periods with semicolons to prevent over-splitting
    const flatDesc = description
      .replace(/\n+/g, "; ")       // newlines → semicolons
      .replace(/\.\s+/g, "; ")     // "foo. bar" → "foo; bar"
      .replace(/\.\s*$/, "");       // trailing period
    parts.push(flatDesc);
  }

  let text = parts.join("; ");

  // --- Pad short texts to meet the 50-char minimum chunk threshold ---
  if (text.length < MIN_CHUNK_LENGTH) {
    // Repeat context until we clear the threshold (no periods — avoid segmenter splitting)
    const pad = `${title}, ${labels.join(", ")} ${priority || ""}`.trim();
    while (text.length < MIN_CHUNK_LENGTH) {
      text += "; " + pad;
    }
  }

  return text;
}

export {
  DEFAULT_EXCLUDE_PATTERNS,
  MIN_CHUNK_LENGTH,
  escapeRegex,
  globToRegex,
  isExcluded,
  isBacklogTask,
  preprocessBacklogTask,
};
