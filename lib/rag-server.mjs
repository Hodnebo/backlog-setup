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
import { stat } from "node:fs/promises";
import { existsSync, watch } from "node:fs";
import { execFile } from "node:child_process";
import { join, resolve, relative, extname, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import { DEFAULT_EXCLUDE_PATTERNS, loadExcludePatterns, isExcluded } from "./exclusion.mjs";
import { SUPPORTED_EXTENSIONS } from "./discovery.mjs";
import { loadHashCache } from "./hashing.mjs";
import { withRetry, ingestFile, removeFile, autoIngest } from "./ingestion.mjs";

// ---------------------------------------------------------------------------
// Environment configuration
// ---------------------------------------------------------------------------

const BASE_DIR = process.env.BASE_DIR || process.cwd();
const DB_PATH = process.env.DB_PATH || join(BASE_DIR, ".lancedb");
const CACHE_DIR = process.env.CACHE_DIR || join(homedir(), ".mcp-local-rag-models");
const MODEL_NAME = process.env.MODEL_NAME || "Xenova/all-MiniLM-L6-v2";
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "104857600", 10);
const WATCH_DEBOUNCE_MS = 300;
const COMMIT_DEBOUNCE_MS = 2000;

const HASH_CACHE_PATH = join(DB_PATH, ".ingest-hashes.json");

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const log = (msg) => process.stderr.write(`[backlog-rag] ${msg}\n`);

// ---------------------------------------------------------------------------
// Directory / file exclusion patterns
// ---------------------------------------------------------------------------

const EXCLUDE_MATCHERS = loadExcludePatterns(BASE_DIR);

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
// Shared hash cache — module-level so both autoIngest and watcher can use it
// ---------------------------------------------------------------------------

let hashes = loadHashCache(HASH_CACHE_PATH);

// ---------------------------------------------------------------------------
// Auto-commit hook — batches file changes into a single git commit
// ---------------------------------------------------------------------------

const HOOK_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "backlog-commit-hook.sh");
const AUTO_COMMIT_ENABLED = (process.env.BACKLOG_AUTO_COMMIT || "true") !== "false";

function buildOperationDescription(changedFiles, deletedFiles) {
  const ids = [];

  for (const f of [...changedFiles, ...deletedFiles]) {
    const name = basename(f, ".md");
    const match = name.match(/^task-(\d+)/i);
    if (match) ids.push(`TASK-${match[1]}`);
  }

  if (changedFiles.size === 0 && deletedFiles.size > 0) {
    return ids.length > 0
      ? `remove ${ids.join(", ")}`
      : `remove ${deletedFiles.size} file(s)`;
  }
  if (ids.length === 1) {
    return `update ${ids[0]}`;
  }
  if (ids.length > 1) {
    return `update ${ids.join(", ")}`;
  }
  return `update ${changedFiles.size + deletedFiles.size} file(s)`;
}

let commitTimer = null;
const pendingChangedFiles = new Set();
const pendingDeletedFiles = new Set();

function scheduleCommit(absPath, deleted) {
  if (!AUTO_COMMIT_ENABLED) return;
  if (!existsSync(HOOK_SCRIPT)) return;

  if (deleted) {
    pendingDeletedFiles.add(absPath);
    pendingChangedFiles.delete(absPath);
  } else {
    pendingChangedFiles.add(absPath);
    pendingDeletedFiles.delete(absPath);
  }

  if (commitTimer) clearTimeout(commitTimer);
  commitTimer = setTimeout(() => {
    commitTimer = null;
    const changed = new Set(pendingChangedFiles);
    const removed = new Set(pendingDeletedFiles);
    pendingChangedFiles.clear();
    pendingDeletedFiles.clear();

    const operation = buildOperationDescription(changed, removed);
    execFile(HOOK_SCRIPT, [operation], {
      env: { ...process.env, BACKLOG_DIR: BASE_DIR },
      timeout: 30000,
    }, (err, _stdout, stderr) => {
      if (err) {
        log(`commit hook error: ${err.message}`);
      }
      if (stderr) {
        process.stderr.write(stderr);
      }
    });
  }, COMMIT_DEBOUNCE_MS);
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
        await withRetry(
          () => ingestFile(absPath, ragServer, hashes, HASH_CACHE_PATH, log),
          absPath,
          log
        );
        scheduleCommit(absPath, false);
      } else if (hashes[absPath]) {
        await withRetry(
          () => removeFile(absPath, ragServer, hashes, HASH_CACHE_PATH, log),
          absPath,
          log
        );
        scheduleCommit(absPath, true);
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
      if (isExcluded(relPath, EXCLUDE_MATCHERS)) return;

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
  await autoIngest(BASE_DIR, ragServer, hashes, HASH_CACHE_PATH, EXCLUDE_MATCHERS, log);
} catch (err) {
  log(`auto-ingest failed (non-fatal): ${err.message}`);
  // Don't block MCP server startup on ingest failure
}

const mcpServer = createMcpServer();
const transport = new StdioServerTransport();
await mcpServer.connect(transport);
log("backlog-rag MCP server started");

startWatcher();
