/**
 * Content hashing — SHA-256 hash cache for change detection.
 *
 * Tracks file content hashes in a JSON file so only new or changed files
 * are re-ingested into the vector store.
 */

import { readFile } from "node:fs/promises";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

/**
 * Compute SHA-256 hash of a file's content.
 *
 * @param {string} filePath — absolute path to file
 * @returns {Promise<string>} hex digest
 */
async function hashFile(filePath) {
  const content = await readFile(filePath, "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Load the hash cache from disk.
 *
 * @param {string} cachePath — absolute path to the hash cache JSON file
 * @returns {Object<string, string>} map of filePath → hash
 */
function loadHashCache(cachePath) {
  if (existsSync(cachePath)) {
    try {
      return JSON.parse(readFileSync(cachePath, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Save the hash cache to disk.
 *
 * @param {string} cachePath — absolute path to the hash cache JSON file
 * @param {Object<string, string>} cache — map of filePath → hash
 */
function saveHashCache(cachePath, cache) {
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

export {
  hashFile,
  loadHashCache,
  saveHashCache,
};
