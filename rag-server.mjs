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
 *   CACHE_DIR — embedding model cache directory
 *
 * Optional env vars:
 *   MODEL_NAME    — HuggingFace model (default: Xenova/all-MiniLM-L6-v2)
 *   MAX_FILE_SIZE — max file size in bytes (default: 100MB)
 */

import { RAGServer } from "mcp-local-rag/dist/server/index.js";
import { readdir, readFile } from "node:fs/promises";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, extname } from "node:path";

const BASE_DIR = process.env.BASE_DIR || process.cwd();
const DB_PATH = process.env.DB_PATH || join(BASE_DIR, ".lancedb");
const CACHE_DIR = process.env.CACHE_DIR || join(BASE_DIR, ".rag-models");
const MODEL_NAME = process.env.MODEL_NAME || "Xenova/all-MiniLM-L6-v2";
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "104857600", 10);

const HASH_CACHE_PATH = join(DB_PATH, ".ingest-hashes.json");
const SUPPORTED_EXTENSIONS = new Set([".md", ".txt", ".pdf", ".docx"]);

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
        await server.handleDeleteFile({ filePath: cachedPath });
        delete hashes[cachedPath];
        deleted++;
        log(`deleted from index: ${cachedPath}`);
      } catch {
        // file might not be in the vector DB — that's fine
        delete hashes[cachedPath];
      }
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
