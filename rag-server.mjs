#!/usr/bin/env node

/**
 * Backlog RAG server — semantic search over backlog tasks.
 *
 * On every startup:
 *   1. Creates a shared RAGServer instance (embedding model loaded once)
 *   2. Scans BASE_DIR for supported files (.md, .txt, .pdf, .docx)
 *   3. Compares content hashes against a local cache
 *   4. Ingests new or changed files into LanceDB
 *   5. Removes deleted files from the index
 *   6. Starts a custom MCP server exposing backlog-named tools over stdio
 *   7. Starts a recursive file watcher on BASE_DIR for live vector DB sync
 *
 * Drop-in replacement for `npx mcp-local-rag` in your MCP client config.
 * Same env vars, same behavior, plus auto-ingest and backlog-specific tool names.
 *
 * Required env vars (set by MCP client config):
 *   BASE_DIR  — root directory to scan for files
 *   DB_PATH   — LanceDB storage directory
 *   CACHE_DIR — embedding model cache directory (default: ~/.mcp-local-rag-models)
 *
 * Optional env vars:
 *   MODEL_NAME       — HuggingFace model (default: Xenova/all-MiniLM-L6-v2)
 *   MAX_FILE_SIZE    — max file size in bytes (default: 100MB)
 *   EXCLUDE_PATTERNS — additional comma-separated exclusion globs (gitignore-style)
 */

import { RAGServer } from "mcp-local-rag/dist/server/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readdir, readFile, stat } from "node:fs/promises";
import { writeFileSync, readFileSync, existsSync, watch } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, relative, extname } from "node:path";
import { homedir } from "node:os";

const BASE_DIR = process.env.BASE_DIR || process.cwd();
const DB_PATH = process.env.DB_PATH || join(BASE_DIR, ".lancedb");
const CACHE_DIR = process.env.CACHE_DIR || join(homedir(), ".mcp-local-rag-models");
const MODEL_NAME = process.env.MODEL_NAME || "Xenova/all-MiniLM-L6-v2";
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "104857600", 10);
const MIN_CHUNK_LENGTH = 50;
const WATCH_DEBOUNCE_MS = 300;

const HASH_CACHE_PATH = join(DB_PATH, ".ingest-hashes.json");
const SUPPORTED_EXTENSIONS = new Set([".md", ".txt", ".pdf", ".docx"]);

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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Load exclusion patterns from:
 *   1. DEFAULT_EXCLUDE_PATTERNS (always included)
 *   2. EXCLUDE_PATTERNS env var (comma-separated)
 *   3. .ragignore file in BASE_DIR (one pattern per line, # comments, blank lines ignored)
 *
 * Returns an array of compiled RegExp matchers.
 */
function loadExcludePatterns() {
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
  const ragignorePath = join(BASE_DIR, ".ragignore");
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

const EXCLUDE_MATCHERS = loadExcludePatterns();

/**
 * Check if a relative path (from BASE_DIR) should be excluded.
 *
 * @param {string} relativePath — forward-slash separated path relative to BASE_DIR
 * @returns {boolean}
 */
function isExcluded(relativePath) {
  for (const re of EXCLUDE_MATCHERS) {
    if (re.test(relativePath)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Shared RAGServer instance — created once, used by both auto-ingest and MCP
// ---------------------------------------------------------------------------

const ragServer = new RAGServer({
  dbPath: DB_PATH,
  modelName: MODEL_NAME,
  cacheDir: CACHE_DIR,
  baseDir: BASE_DIR,
  maxFileSize: MAX_FILE_SIZE,
});

await ragServer.initialize();

// ---------------------------------------------------------------------------
// Backlog task pre-processing
// ---------------------------------------------------------------------------

/**
 * Detect whether a file is a backlog task (YAML frontmatter with id/title/status).
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

// ---------------------------------------------------------------------------
// File scanning and hashing
// ---------------------------------------------------------------------------

const log = (msg) => process.stderr.write(`[backlog-rag] ${msg}\n`);

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;

/**
 * Retry an async operation with exponential backoff.
 * Logs each retry attempt to stderr. Returns the result on success or throws
 * the last error after all retries are exhausted.
 *
 * @param {() => Promise<T>} fn    — async function to retry
 * @param {string}           label — human-readable label for log messages
 * @returns {Promise<T>}
 */
async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_BASE_MS * 2 ** attempt;
        log(`retry ${attempt + 1}/${MAX_RETRIES} for ${label}: ${err.message} (backoff ${delayMs}ms)`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

async function findFiles(dir) {
  const results = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(BASE_DIR, fullPath);

      // Check exclusion before recursing or collecting
      if (isExcluded(relPath)) continue;

      if (entry.isDirectory()) {
        results.push(...(await findFiles(fullPath)));
      } else if (
        entry.isFile() &&
        SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())
      ) {
        results.push(fullPath);
      }
    }
  } catch {
    // directory doesn't exist or isn't readable — skip
  }
  return results;
}

async function hashFile(filePath) {
  const content = await readFile(filePath, "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

function loadHashCache() {
  if (existsSync(HASH_CACHE_PATH)) {
    try {
      return JSON.parse(readFileSync(HASH_CACHE_PATH, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function saveHashCache(cache) {
  writeFileSync(HASH_CACHE_PATH, JSON.stringify(cache, null, 2));
}

// ---------------------------------------------------------------------------
// Shared hash cache — module-level so both autoIngest and watcher can use it
// ---------------------------------------------------------------------------

let hashes = loadHashCache();

// ---------------------------------------------------------------------------
// Single-file ingest / remove — reused by autoIngest and file watcher
// ---------------------------------------------------------------------------

/**
 * Ingest or re-ingest a single file. Returns true if the file was ingested
 * (new or changed), false if unchanged. Throws on error.
 */
async function ingestFile(absPath) {
  const hash = await hashFile(absPath);
  if (hashes[absPath] === hash) return false;

  // Check if this is a backlog task .md file — pre-process for better embeddings
  const rawContent = await readFile(absPath, "utf-8");
  if (extname(absPath).toLowerCase() === ".md" && isBacklogTask(rawContent)) {
    const cleanText = preprocessBacklogTask(rawContent);
    if (cleanText) {
      const source = `backlog://${absPath}`;
      await ragServer.handleIngestData({
        content: cleanText,
        metadata: { source, format: "text" },
      });
      hashes[absPath] = hash;
      saveHashCache(hashes);
      log(`ingested (preprocessed): ${absPath} (${cleanText.length} chars)`);
      return true;
    }
    // Fall through to raw ingest if preprocessing returned null
  }

  await ragServer.handleIngestFile({ filePath: absPath });
  hashes[absPath] = hash;
  saveHashCache(hashes);
  log(`ingested: ${absPath}`);
  return true;
}

/**
 * Remove a single file from the vector index and hash cache.
 */
async function removeFile(absPath) {
  // Try both deletion methods: source-based (backlog tasks) and filePath-based (raw files)
  try {
    await ragServer.handleDeleteFile({ source: `backlog://${absPath}` });
  } catch {
    // Not a backlog task or already gone — try filePath-based
  }
  try {
    await ragServer.handleDeleteFile({ filePath: absPath });
  } catch {
    // file might not be in the vector DB — that's fine
  }
  delete hashes[absPath];
  saveHashCache(hashes);
  log(`deleted from index: ${absPath}`);
}

// ---------------------------------------------------------------------------
// Auto-ingest — runs before MCP server starts
// ---------------------------------------------------------------------------

async function autoIngest() {
  const files = await findFiles(BASE_DIR);
  const currentPaths = new Set(files.map((f) => resolve(f)));

  let ingested = 0;
  let skipped = 0;
  let deleted = 0;
  let errors = 0;
  const failedFiles = [];

  // Ingest new or changed files
  for (const filePath of files) {
    const absPath = resolve(filePath);
    try {
      const changed = await withRetry(() => ingestFile(absPath), absPath);
      if (changed) {
        ingested++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      failedFiles.push(absPath);
      log(`permanently failed to ingest ${absPath}: ${err.message}`);
    }
  }

  // Remove deleted files from index
  for (const cachedPath of Object.keys(hashes)) {
    if (!currentPaths.has(cachedPath)) {
      try {
        await withRetry(() => removeFile(cachedPath), cachedPath);
      } catch (err) {
        log(`permanently failed to remove ${cachedPath}: ${err.message}`);
      }
      deleted++;
    }
  }

  if (ingested > 0 || deleted > 0 || errors > 0) {
    log(
      `done: ${ingested} ingested, ${skipped} unchanged, ${deleted} removed, ${errors} errors`
    );
  } else {
    log(`all ${skipped} files up to date`);
  }

  if (failedFiles.length > 0) {
    log(`permanently failed files (${failedFiles.length}): ${failedFiles.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// File watcher — live sync after startup
// ---------------------------------------------------------------------------

/**
 * Start a recursive fs.watch on BASE_DIR. File changes are debounced per-path
 * and then ingested or removed from the vector DB.
 *
 * The watcher is non-fatal: errors are logged but never crash the process.
 * On platforms where recursive watching is unsupported, a warning is logged
 * and the server falls back to startup-only sync.
 */
function startWatcher() {
  const pending = new Map();

  /** Handle a debounced file event. */
  async function handleFileEvent(absPath) {
    try {
      // Check if file still exists (rename/delete events)
      let exists = false;
      try {
        await stat(absPath);
        exists = true;
      } catch {
        // stat failed — file was deleted or renamed away
      }

      if (exists) {
        await withRetry(() => ingestFile(absPath), absPath);
      } else if (hashes[absPath]) {
        await withRetry(() => removeFile(absPath), absPath);
      }
    } catch (err) {
      log(`watcher permanently failed for ${absPath}: ${err.message}`);
    }
  }

  try {
    const watcher = watch(BASE_DIR, { recursive: true });

    watcher.on("change", (_eventType, filename) => {
      if (!filename) return;

      const absPath = resolve(join(BASE_DIR, filename));

      // Only process supported file types
      if (!SUPPORTED_EXTENSIONS.has(extname(absPath).toLowerCase())) return;

      // Skip excluded paths
      const relPath = relative(BASE_DIR, absPath);
      if (isExcluded(relPath)) return;

      // Debounce: reset timer on every event for this path
      if (pending.has(absPath)) clearTimeout(pending.get(absPath));
      pending.set(
        absPath,
        setTimeout(() => {
          pending.delete(absPath);
          handleFileEvent(absPath);
        }, WATCH_DEBOUNCE_MS)
      );
    });

    watcher.on("error", (err) => {
      log(`watcher error: ${err.message}`);
    });

    log("file watcher started on " + BASE_DIR);
  } catch (err) {
    log(`file watcher unavailable (non-fatal): ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Custom MCP server — backlog-named tools wrapping RAGServer handlers
// ---------------------------------------------------------------------------

function createMcpServer() {
  const server = new McpServer({
    name: "backlog-rag",
    version: "1.0.0",
  });

  // -- Primary search tool --------------------------------------------------

  server.tool(
    "backlog_semantic_search",
    "PRIMARY search tool for backlog tasks and project documents; " +
    "use this FIRST for any task search — it finds results by meaning, synonyms, and conceptual similarity; " +
    "handles natural-language queries like 'authentication issues' or 'performance improvements'; " +
    "prefer over backlog_task_search which is only for exact task ID lookups or structured filtering; " +
    "returns matched text with source and relevance score (0 = best)",
    {
      query: z.string().describe(
        "Natural language search query; be specific and include context"
      ),
      limit: z.number().int().min(1).max(50).optional().describe(
        "Max results to return (default: 10); use 5 for precision, 20 for broad exploration"
      ),
    },
    async ({ query, limit }) => {
      const args = { query };
      if (limit !== undefined) args.limit = limit;
      return await ragServer.handleQueryDocuments(args);
    }
  );

  // -- Admin tools (auto-ingest handles most of this, but expose for manual use)

  server.tool(
    "backlog_rag_ingest_file",
    "Manually ingest a file into the backlog semantic search index; " +
    "auto-ingest handles this on startup so manual use is rarely needed; " +
    "supports PDF, DOCX, TXT, MD",
    {
      filePath: z.string().describe("Absolute path to the file to ingest"),
    },
    async ({ filePath }) => {
      return await ragServer.handleIngestFile({ filePath });
    }
  );

  server.tool(
    "backlog_rag_ingest_data",
    "Ingest text content into the backlog semantic search index; " +
    "use for web pages, clipboard text, or markdown strings; " +
    "the source identifier enables re-ingestion to update existing content",
    {
      content: z.string().describe("The content to ingest (text, HTML, or Markdown)"),
      metadata: z.object({
        source: z.string().describe(
          "Source identifier; use URL for web pages or scheme://date format"
        ),
        format: z.enum(["text", "html", "markdown"]).describe("Content format"),
      }),
    },
    async ({ content, metadata }) => {
      return await ragServer.handleIngestData({ content, metadata });
    }
  );

  server.tool(
    "backlog_rag_delete",
    "Remove a file or data source from the backlog semantic search index; " +
    "use filePath for files or source for data ingested via ingest_data",
    {
      filePath: z.string().optional().describe("Absolute path to the file to remove"),
      source: z.string().optional().describe("Source identifier used during ingest_data"),
    },
    async ({ filePath, source }) => {
      const args = {};
      if (filePath) args.filePath = filePath;
      if (source) args.source = source;
      return await ragServer.handleDeleteFile(args);
    }
  );

  server.tool(
    "backlog_rag_list",
    "List all files and data sources in the backlog semantic search index; " +
    "shows which files are ingested and their status",
    {},
    async () => {
      return await ragServer.handleListFiles();
    }
  );

  server.tool(
    "backlog_rag_status",
    "Get backlog semantic search system status; " +
    "shows total documents, chunks, database size, and configuration",
    {},
    async () => {
      return await ragServer.handleStatus();
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Main — auto-ingest then start MCP server
// ---------------------------------------------------------------------------

try {
  log(`exclude patterns: ${EXCLUDE_MATCHERS.length} (${DEFAULT_EXCLUDE_PATTERNS.length} default)`);
  await autoIngest();
} catch (err) {
  log(`auto-ingest failed (non-fatal): ${err.message}`);
  // Don't block MCP server startup on ingest failure
}

const mcpServer = createMcpServer();
const transport = new StdioServerTransport();
await mcpServer.connect(transport);
log("backlog-rag MCP server started");

startWatcher();
