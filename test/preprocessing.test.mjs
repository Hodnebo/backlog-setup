import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isBacklogTask,
  preprocessBacklogTask,
  MIN_CHUNK_LENGTH,
} from "../lib/preprocessing.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal backlog task .md string from frontmatter fields + optional body. */
function makeTask({ id = "TASK-1", title = "Fix the bug", priority, labels, status, extra = "" } = {}, body = "") {
  const lines = [`id: ${id}`, `title: ${title}`];
  if (status) lines.push(`status: ${status}`);
  if (priority) lines.push(`priority: ${priority}`);
  if (labels) {
    if (Array.isArray(labels)) {
      lines.push("labels:");
      for (const l of labels) lines.push(`  - ${l}`);
    } else {
      lines.push(`labels: ${labels}`);
    }
  }
  if (extra) lines.push(extra);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

// ---------------------------------------------------------------------------
// isBacklogTask
// ---------------------------------------------------------------------------

describe("isBacklogTask", () => {
  it("returns true for valid frontmatter with id and title", () => {
    const content = makeTask();
    assert.equal(isBacklogTask(content), true);
  });

  it("returns false when id field is missing", () => {
    const content = "---\ntitle: Something\nstatus: To Do\n---\n";
    assert.equal(isBacklogTask(content), false);
  });

  it("returns false when title field is missing", () => {
    const content = "---\nid: TASK-1\nstatus: To Do\n---\n";
    assert.equal(isBacklogTask(content), false);
  });

  it("returns false for plain markdown without frontmatter", () => {
    assert.equal(isBacklogTask("# Just a heading\n\nSome text."), false);
  });

  it("returns false for empty string", () => {
    assert.equal(isBacklogTask(""), false);
  });

  it("returns false for frontmatter without closing delimiter", () => {
    assert.equal(isBacklogTask("---\nid: TASK-1\ntitle: Foo\n"), false);
  });

  it("returns true when extra fields are present", () => {
    const content = makeTask({ priority: "high", status: "To Do", labels: ["bug", "rag"] });
    assert.equal(isBacklogTask(content), true);
  });
});

// ---------------------------------------------------------------------------
// preprocessBacklogTask — field extraction
// ---------------------------------------------------------------------------

describe("preprocessBacklogTask — field extraction", () => {
  it("extracts title into output", () => {
    const result = preprocessBacklogTask(makeTask({ title: "Implement auth flow" }));
    assert.ok(result.startsWith("Implement auth flow"));
  });

  it("returns null when no frontmatter exists", () => {
    assert.equal(preprocessBacklogTask("# No frontmatter"), null);
  });

  it("returns null when title is missing from frontmatter", () => {
    const content = "---\nid: TASK-1\npriority: high\n---\nBody text here.";
    assert.equal(preprocessBacklogTask(content), null);
  });

  it("includes priority when present", () => {
    const result = preprocessBacklogTask(makeTask({ priority: "high" }));
    assert.ok(result.includes("priority: high"));
  });

  it("omits priority segment when not present", () => {
    const result = preprocessBacklogTask(makeTask({ priority: undefined }));
    assert.ok(!result.includes("priority:"));
  });

  it("extracts YAML list labels", () => {
    const result = preprocessBacklogTask(makeTask({ labels: ["bug", "frontend"] }));
    assert.ok(result.includes("labels: bug, frontend"));
  });

  it("omits labels segment when no labels present", () => {
    const result = preprocessBacklogTask(makeTask());
    assert.ok(!result.includes("labels:"));
  });
});

// ---------------------------------------------------------------------------
// preprocessBacklogTask — semicolon separators
// ---------------------------------------------------------------------------

describe("preprocessBacklogTask — semicolon separators", () => {
  it("uses semicolons between title and labels", () => {
    const result = preprocessBacklogTask(makeTask({ labels: ["a"] }));
    assert.ok(result.includes("; labels: a"));
  });

  it("uses semicolons between labels and priority", () => {
    const result = preprocessBacklogTask(makeTask({ labels: ["a"], priority: "low" }));
    assert.ok(result.includes("labels: a; priority: low"));
  });

  it("does not contain period-space sequences (which would trigger chunker splitting)", () => {
    const body = "This is a sentence. And another one. Final.";
    const result = preprocessBacklogTask(makeTask({}, body));
    assert.ok(!(/\.\s/.test(result)), "Should not contain period followed by whitespace");
  });

  it("replaces newlines in description with semicolons", () => {
    const body = "Line one\nLine two\nLine three";
    const result = preprocessBacklogTask(makeTask({}, body));
    assert.ok(result.includes("; Line one; Line two; Line three") || result.includes("Line one; Line two; Line three"));
  });

  it("removes trailing period from description", () => {
    const body = "Ends with a period.";
    const result = preprocessBacklogTask(makeTask({}, body));
    assert.ok(!result.endsWith("."));
  });
});

// ---------------------------------------------------------------------------
// preprocessBacklogTask — 50-char minimum padding
// ---------------------------------------------------------------------------

describe("preprocessBacklogTask — 50-char padding", () => {
  it("pads short output to at least MIN_CHUNK_LENGTH characters", () => {
    const result = preprocessBacklogTask(makeTask({ title: "Short" }));
    assert.ok(result.length >= MIN_CHUNK_LENGTH, `Expected >= ${MIN_CHUNK_LENGTH}, got ${result.length}`);
  });

  it("does not pad text already at or above the threshold", () => {
    const longTitle = "A".repeat(MIN_CHUNK_LENGTH + 10);
    const result = preprocessBacklogTask(makeTask({ title: longTitle }));
    // Should contain exactly one occurrence of the title (no padding appended)
    const occurrences = result.split(longTitle).length - 1;
    assert.equal(occurrences, 1);
  });

  it("padding uses title and labels (not periods)", () => {
    const result = preprocessBacklogTask(makeTask({ title: "Hi", labels: ["x"] }));
    assert.ok(result.length >= MIN_CHUNK_LENGTH);
    // Padding should not introduce periods
    assert.ok(!(/\.\s/.test(result)));
  });
});

// ---------------------------------------------------------------------------
// preprocessBacklogTask — HTML section markers
// ---------------------------------------------------------------------------

describe("preprocessBacklogTask — HTML section markers", () => {
  it("extracts description from SECTION:DESCRIPTION markers", () => {
    const body = "\n<!-- SECTION:DESCRIPTION:BEGIN -->\nThe actual description\n<!-- SECTION:DESCRIPTION:END -->\n<!-- SECTION:OTHER:BEGIN -->\nIgnored\n<!-- SECTION:OTHER:END -->\n";
    const result = preprocessBacklogTask(makeTask({}, body));
    assert.ok(result.includes("The actual description"));
    assert.ok(!result.includes("Ignored"));
  });

  it("strips HTML comments in fallback mode", () => {
    const body = "\n<!-- some comment -->\nVisible text\n";
    const result = preprocessBacklogTask(makeTask({}, body));
    assert.ok(result.includes("Visible text"));
    assert.ok(!result.includes("some comment"));
  });

  it("strips markdown headings in fallback mode", () => {
    const body = "\n## Description\nThe content below heading\n";
    const result = preprocessBacklogTask(makeTask({}, body));
    assert.ok(result.includes("The content below heading"));
    assert.ok(!result.includes("## Description"));
  });
});

// ---------------------------------------------------------------------------
// preprocessBacklogTask — edge cases
// ---------------------------------------------------------------------------

describe("preprocessBacklogTask — edge cases", () => {
  it("handles empty description body", () => {
    const result = preprocessBacklogTask(makeTask({ title: "Title only" }));
    assert.ok(result !== null);
    assert.ok(result.includes("Title only"));
  });

  it("handles title with special characters", () => {
    const result = preprocessBacklogTask(makeTask({ title: "Fix bug #42 (urgent!)" }));
    assert.ok(result.includes("Fix bug #42 (urgent!)"));
  });

  it("handles quoted title in frontmatter", () => {
    const content = '---\nid: TASK-1\ntitle: "Quoted title"\n---\n';
    const result = preprocessBacklogTask(content);
    assert.ok(result.includes("Quoted title"));
    // Quotes should be stripped
    assert.ok(!result.includes('"Quoted title"'));
  });

  it("handles single-quoted title in frontmatter", () => {
    const content = "---\nid: TASK-1\ntitle: 'Single quoted'\n---\n";
    const result = preprocessBacklogTask(content);
    assert.ok(result.includes("Single quoted"));
  });

  it("handles multiple labels correctly", () => {
    const result = preprocessBacklogTask(makeTask({ labels: ["bug", "rag-server", "testing"] }));
    assert.ok(result.includes("labels: bug, rag-server, testing"));
  });

  it("handles task with all fields populated", () => {
    const body = "<!-- SECTION:DESCRIPTION:BEGIN -->\nFull description here.\n<!-- SECTION:DESCRIPTION:END -->";
    const result = preprocessBacklogTask(
      makeTask({ title: "Full task", priority: "high", labels: ["a", "b"], status: "In Progress" }, body)
    );
    assert.ok(result.includes("Full task"));
    assert.ok(result.includes("labels: a, b"));
    assert.ok(result.includes("priority: high"));
    assert.ok(result.includes("Full description here"));
  });
});
