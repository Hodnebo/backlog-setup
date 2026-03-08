/**
 * Ingestion — ingest/remove files from the vector store with retry logic.
 *
 * Handles single-file operations and batch auto-ingest on startup.
 * Uses content hashing to skip unchanged files.
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { resolve } from "node:path";
import { isBacklogTask, preprocessBacklogTask } from "./preprocessing.mjs";
import { hashFile, saveHashCache } from "./hashing.mjs";
import { findFiles } from "./discovery.mjs";

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;

/**
 * Retry an async operation with exponential backoff.
 * Logs each retry attempt to stderr. Returns the result on success or throws
 * the last error after all retries are exhausted.
 *
 * @param {() => Promise<T>} fn    — async function to retry
 * @param {string}           label — human-readable label for log messages
 * @param {(msg: string) => void} log — logging function
 * @returns {Promise<T>}
 */
async function withRetry(fn, label, log) {
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

/**
 * Ingest or re-ingest a single file. Returns true if the file was ingested
 * (new or changed), false if unchanged. Throws on error.
 *
 * @param {string} absPath — absolute path to file
 * @param {Object} ragServer — RAGServer instance
 * @param {Object<string, string>} hashes — hash cache (mutated in place)
 * @param {string} hashCachePath — path to hash cache file
 * @param {(msg: string) => void} log — logging function
 * @returns {Promise<boolean>}
 */
async function ingestFile(absPath, ragServer, hashes, hashCachePath, log) {
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
      saveHashCache(hashCachePath, hashes);
      log(`ingested (preprocessed): ${absPath} (${cleanText.length} chars)`);
      return true;
    }
    // Fall through to raw ingest if preprocessing returned null
  }

  await ragServer.handleIngestFile({ filePath: absPath });
  hashes[absPath] = hash;
  saveHashCache(hashCachePath, hashes);
  log(`ingested: ${absPath}`);
  return true;
}

/**
 * Remove a single file from the vector index and hash cache.
 *
 * @param {string} absPath — absolute path to file
 * @param {Object} ragServer — RAGServer instance
 * @param {Object<string, string>} hashes — hash cache (mutated in place)
 * @param {string} hashCachePath — path to hash cache file
 * @param {(msg: string) => void} log — logging function
 */
async function removeFile(absPath, ragServer, hashes, hashCachePath, log) {
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
  saveHashCache(hashCachePath, hashes);
  log(`deleted from index: ${absPath}`);
}

/**
 * Scan BASE_DIR, ingest new/changed files, remove deleted files.
 *
 * @param {string} baseDir — root directory to scan
 * @param {Object} ragServer — RAGServer instance
 * @param {Object<string, string>} hashes — hash cache (mutated in place)
 * @param {string} hashCachePath — path to hash cache file
 * @param {RegExp[]} excludeMatchers — compiled exclusion patterns
 * @param {(msg: string) => void} log — logging function
 */
async function autoIngest(baseDir, ragServer, hashes, hashCachePath, excludeMatchers, log) {
  const files = await findFiles(baseDir, baseDir, excludeMatchers);
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
      const changed = await withRetry(
        () => ingestFile(absPath, ragServer, hashes, hashCachePath, log),
        absPath,
        log
      );
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
        await withRetry(
          () => removeFile(cachedPath, ragServer, hashes, hashCachePath, log),
          cachedPath,
          log
        );
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

export {
  MAX_RETRIES,
  RETRY_BASE_MS,
  withRetry,
  ingestFile,
  removeFile,
  autoIngest,
};
