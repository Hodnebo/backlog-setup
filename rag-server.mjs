#!/usr/bin/env node

/**
 * Auto-ingest wrapper for mcp-local-rag.
 *
 * On every startup:
 *   1. Scans BASE_DIR for supported files (.md, .txt, .pdf, .docx)
 *   2. Compares content hashes against a local cache
 *   3. Ingests new or changed files into LanceDB
 *   4. Removes deleted files from the index
 *   5. Starts the real MCP server over stdio
 *
 * Drop-in replacement for `npx mcp-local-rag` in your MCP client config.
 * Same env vars, same behavior, plus auto-ingest on startup.
 *
 * Required env vars (set by MCP client config):
 *   BASE_DIR  — root directory to scan for files
 *   DB_PATH   — LanceDB storage directory
 *   CACHE_DIR — embedding model cache directory (default: ~/.mcp-local-rag-models)
 *
 * Optional env vars:
 *   MODEL_NAME    — HuggingFace model (default: Xenova/all-MiniLM-L6-v2)
 *   MAX_FILE_SIZE — max file size in bytes (default: 100MB)
 */

import { RAGServer } from "mcp-local-rag/dist/server/index.js";
import { readdir, readFile } from "node:fs/promises";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, extname, basename } from "node:path";
import { homedir } from "node:os";

const BASE_DIR = process.env.BASE_DIR || process.cwd();
const DB_PATH = process.env.DB_PATH || join(BASE_DIR, ".lancedb");
const CACHE_DIR = process.env.CACHE_DIR || join(homedir(), ".mcp-local-rag-models");
const MODEL_NAME = process.env.MODEL_NAME || "Xenova/all-MiniLM-L6-v2";
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "104857600", 10);
const MIN_CHUNK_LENGTH = 50;

const HASH_CACHE_PATH = join(DB_PATH, ".ingest-hashes.json");
const SUPPORTED_EXTENSIONS = new Set([".md", ".txt", ".pdf", ".docx"]);

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

const log = (msg) => process.stderr.write(`[auto-ingest] ${msg}\n`);

async function findFiles(dir) {
  const results = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
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

async function autoIngest() {
  const server = new RAGServer({
    dbPath: DB_PATH,
    modelName: MODEL_NAME,
    cacheDir: CACHE_DIR,
    baseDir: BASE_DIR,
    maxFileSize: MAX_FILE_SIZE,
  });

  await server.initialize();

  const files = await findFiles(BASE_DIR);
  const hashes = loadHashCache();
  const currentPaths = new Set(files.map((f) => resolve(f)));

  let ingested = 0;
  let skipped = 0;
  let deleted = 0;
  let errors = 0;

  // Ingest new or changed files
  for (const filePath of files) {
    const absPath = resolve(filePath);
    try {
      const hash = await hashFile(absPath);
      if (hashes[absPath] === hash) {
        skipped++;
        continue;
      }

      // Check if this is a backlog task .md file — pre-process for better embeddings
      const rawContent = await readFile(absPath, "utf-8");
      if (extname(absPath).toLowerCase() === ".md" && isBacklogTask(rawContent)) {
        const cleanText = preprocessBacklogTask(rawContent);
        if (cleanText) {
          const source = `backlog://${absPath}`;
          await server.handleIngestData({
            content: cleanText,
            metadata: { source, format: "text" },
          });
          hashes[absPath] = hash;
          ingested++;
          log(`ingested (preprocessed): ${absPath} (${cleanText.length} chars)`);
          continue;
        }
        // Fall through to raw ingest if preprocessing returned null
      }

      await server.handleIngestFile({ filePath: absPath });
      hashes[absPath] = hash;
      ingested++;
      log(`ingested: ${absPath}`);
    } catch (err) {
      errors++;
      log(`error ingesting ${absPath}: ${err.message}`);
    }
  }

  // Remove deleted files from index
  for (const cachedPath of Object.keys(hashes)) {
    if (!currentPaths.has(cachedPath)) {
      try {
        // Try both deletion methods: source-based (backlog tasks) and filePath-based (raw files)
        try {
          await server.handleDeleteFile({ source: `backlog://${cachedPath}` });
        } catch {
          // Not a backlog task or already gone — try filePath-based
        }
        await server.handleDeleteFile({ filePath: cachedPath });
      } catch {
        // file might not be in the vector DB — that's fine
      }
      delete hashes[cachedPath];
      deleted++;
      log(`deleted from index: ${cachedPath}`);
    }
  }

  saveHashCache(hashes);

  if (ingested > 0 || deleted > 0 || errors > 0) {
    log(
      `done: ${ingested} ingested, ${skipped} unchanged, ${deleted} removed, ${errors} errors`
    );
  } else {
    log(`all ${skipped} files up to date`);
  }
}

// --- Main ---

try {
  await autoIngest();
} catch (err) {
  log(`auto-ingest failed (non-fatal): ${err.message}`);
  // Don't block MCP server startup on ingest failure
}

// Start the real MCP server — hands off stdio
const { startServer } = await import("mcp-local-rag/dist/server-main.js");
await startServer();
