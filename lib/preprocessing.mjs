/**
 * Backlog task pre-processing — extract structured text from task files.
 *
 * Parses YAML frontmatter, strips noise, and produces clean embedding-friendly
 * text. Uses semicolons (not periods) to avoid mcp-local-rag's SemanticChunker
 * splitting on sentence boundaries.
 *
 * Pure functions, no I/O, no side effects.
 */

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
  MIN_CHUNK_LENGTH,
  isBacklogTask,
  preprocessBacklogTask,
};
