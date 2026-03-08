/**
 * File discovery — recursive directory scanning with exclusion support.
 *
 * Finds supported files (.md, .txt, .pdf, .docx) under a base directory,
 * skipping excluded paths.
 */

import { readdir } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { isExcluded } from "./exclusion.mjs";

const SUPPORTED_EXTENSIONS = new Set([".md", ".txt", ".pdf", ".docx"]);

/**
 * Recursively find all supported files under a directory.
 *
 * @param {string} dir — directory to scan
 * @param {string} baseDir — root directory for relative path computation
 * @param {RegExp[]} excludeMatchers — compiled exclusion patterns
 * @returns {Promise<string[]>} absolute file paths
 */
async function findFiles(dir, baseDir, excludeMatchers) {
  const results = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(baseDir, fullPath);

      // Check exclusion before recursing or collecting
      if (isExcluded(relPath, excludeMatchers)) continue;

      if (entry.isDirectory()) {
        results.push(...(await findFiles(fullPath, baseDir, excludeMatchers)));
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

export {
  SUPPORTED_EXTENSIONS,
  findFiles,
};
