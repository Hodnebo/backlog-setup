import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the AGENTS_WORKFLOW template string from setup.mjs content. */
function extractAgentsTemplate(setupContent) {
  const match = setupContent.match(
    /const AGENTS_WORKFLOW = `([\s\S]*?)`;/
  );
  return match ? match[1] : "";
}

// ---------------------------------------------------------------------------
// setup.mjs — AGENTS.md template
// ---------------------------------------------------------------------------

describe("guidance policy — setup.mjs AGENTS.md template", () => {
  let template;

  it("loads the AGENTS.md template from setup.mjs", async () => {
    const content = await readFile(join(ROOT, "setup.mjs"), "utf-8");
    template = extractAgentsTemplate(content);
    assert.ok(template.length > 0, "Should find AGENTS_WORKFLOW template in setup.mjs");
  });

  it("mentions backlog_task_complete for finishing tasks", async () => {
    if (!template) {
      const content = await readFile(join(ROOT, "setup.mjs"), "utf-8");
      template = extractAgentsTemplate(content);
    }
    assert.ok(
      template.includes("backlog_task_complete"),
      "AGENTS.md template should instruct agents to use backlog_task_complete"
    );
  });

  it("does NOT instruct backlog_task_edit for task completion", async () => {
    if (!template) {
      const content = await readFile(join(ROOT, "setup.mjs"), "utf-8");
      template = extractAgentsTemplate(content);
    }
    assert.ok(
      !template.includes('Mark the task "Done" with `backlog_task_edit`'),
      "AGENTS.md template should NOT say to use backlog_task_edit to mark tasks Done"
    );
  });
});

// ---------------------------------------------------------------------------
// skills/backlog-semantic-search.md
// ---------------------------------------------------------------------------

describe("guidance policy — skills/backlog-semantic-search.md", () => {
  let content;

  it("mentions backlog_task_complete", async () => {
    content = await readFile(
      join(ROOT, "skills/backlog-semantic-search.md"),
      "utf-8"
    );
    assert.ok(
      content.includes("backlog_task_complete"),
      "Skill file should mention backlog_task_complete"
    );
  });

  it("warns against using backlog_task_edit for completion", async () => {
    if (!content) {
      content = await readFile(
        join(ROOT, "skills/backlog-semantic-search.md"),
        "utf-8"
      );
    }
    assert.ok(
      content.includes("backlog_task_edit") &&
        content.includes("Wrong"),
      "Skill file should explicitly mark backlog_task_edit(status=Done) as wrong"
    );
  });
});

// ---------------------------------------------------------------------------
// lib/workflow-guides.mjs
// ---------------------------------------------------------------------------

describe("guidance policy — lib/workflow-guides.mjs", () => {
  let guides;

  it("can be imported", async () => {
    guides = await import(join(ROOT, "lib/workflow-guides.mjs"));
    assert.ok(guides, "workflow-guides.mjs should be importable");
  });

  it("exports at least one guide constant", async () => {
    if (!guides) guides = await import(join(ROOT, "lib/workflow-guides.mjs"));
    const exportNames = Object.keys(guides).filter(
      (k) => typeof guides[k] === "string"
    );
    assert.ok(
      exportNames.length > 0,
      "Should export at least one string guide constant"
    );
  });

  it("exported finalization guide mentions backlog_task_complete", async () => {
    if (!guides) guides = await import(join(ROOT, "lib/workflow-guides.mjs"));
    // Expect a TASK_FINALIZATION_GUIDE or similar export
    const finalizationKey = Object.keys(guides).find(
      (k) => /finali[sz]/i.test(k) && typeof guides[k] === "string"
    );
    assert.ok(finalizationKey, "Should export a finalization guide constant");
    assert.ok(
      guides[finalizationKey].includes("backlog_task_complete"),
      "Finalization guide should mention backlog_task_complete"
    );
  });

  it("no exported guide instructs backlog_task_edit for completion", async () => {
    if (!guides) guides = await import(join(ROOT, "lib/workflow-guides.mjs"));
    for (const [key, value] of Object.entries(guides)) {
      if (typeof value !== "string") continue;
      assert.ok(
        !value.includes('Mark the task "Done" with `backlog_task_edit`'),
        `Guide "${key}" should not instruct using backlog_task_edit to mark tasks Done`
      );
    }
  });
});
