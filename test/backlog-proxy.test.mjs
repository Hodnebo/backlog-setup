import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// The 4 workflow guide tools that the proxy should intercept
// ---------------------------------------------------------------------------

const WORKFLOW_GUIDE_TOOLS = [
  "backlog_get_workflow_overview",
  "backlog_get_task_creation_guide",
  "backlog_get_task_execution_guide",
  "backlog_get_task_finalization_guide",
];

// ---------------------------------------------------------------------------
// Module import
// ---------------------------------------------------------------------------

describe("backlog-proxy — module exports", () => {
  let proxy;

  it("can be imported", async () => {
    proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    assert.ok(proxy, "backlog-proxy.mjs should be importable");
  });

  it("exports getGuideOverride function", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    assert.equal(
      typeof proxy.getGuideOverride,
      "function",
      "Should export getGuideOverride(toolName)"
    );
  });

  it("exports GUIDE_TOOL_NAMES array", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    assert.ok(
      Array.isArray(proxy.GUIDE_TOOL_NAMES),
      "Should export GUIDE_TOOL_NAMES as an array"
    );
  });
});

// ---------------------------------------------------------------------------
// Guide override lookup
// ---------------------------------------------------------------------------

describe("backlog-proxy — guide override lookup", () => {
  let proxy;

  it("returns content for each workflow guide tool", async () => {
    proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    for (const toolName of WORKFLOW_GUIDE_TOOLS) {
      const result = proxy.getGuideOverride(toolName);
      assert.ok(
        result !== null && result !== undefined,
        `getGuideOverride("${toolName}") should return content`
      );
      assert.equal(
        typeof result,
        "string",
        `Override for "${toolName}" should be a string`
      );
      assert.ok(
        result.length > 0,
        `Override for "${toolName}" should not be empty`
      );
    }
  });

  it("returns null for non-guide tools", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    const nonGuideTools = [
      "backlog_task_create",
      "backlog_task_edit",
      "backlog_task_list",
      "backlog_task_view",
      "backlog_semantic_search",
    ];
    for (const toolName of nonGuideTools) {
      const result = proxy.getGuideOverride(toolName);
      assert.equal(
        result,
        null,
        `getGuideOverride("${toolName}") should return null for non-guide tools`
      );
    }
  });

  it("GUIDE_TOOL_NAMES contains exactly the 4 workflow guide tools", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    assert.equal(proxy.GUIDE_TOOL_NAMES.length, 4);
    for (const name of WORKFLOW_GUIDE_TOOLS) {
      assert.ok(
        proxy.GUIDE_TOOL_NAMES.includes(name),
        `GUIDE_TOOL_NAMES should include "${name}"`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Guide content quality
// ---------------------------------------------------------------------------

describe("backlog-proxy — guide content quality", () => {
  let proxy;

  it("finalization guide override mentions backlog_task_complete", async () => {
    proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    const content = proxy.getGuideOverride("backlog_get_task_finalization_guide");
    assert.ok(
      content.includes("backlog_task_complete"),
      "Finalization guide override should mention backlog_task_complete"
    );
  });

  it("finalization guide override warns against backlog_task_edit for Done", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    const content = proxy.getGuideOverride("backlog_get_task_finalization_guide");
    // Should warn against using status: Done via edit
    assert.ok(
      /backlog_task_edit.*Done|status.*Done.*backlog_task_edit/i.test(content) ||
        content.includes("do not") ||
        content.includes("Do NOT") ||
        content.includes("instead of"),
      "Finalization guide should warn against setting status to Done via backlog_task_edit"
    );
  });

  it("workflow overview override mentions backlog_task_complete", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    const content = proxy.getGuideOverride("backlog_get_workflow_overview");
    assert.ok(
      content.includes("backlog_task_complete"),
      "Workflow overview override should mention backlog_task_complete"
    );
  });
});

// ---------------------------------------------------------------------------
// Tool forwarding logic
// ---------------------------------------------------------------------------

describe("backlog-proxy — tool dispatching", () => {
  let proxy;

  it("exports createToolHandler that wraps a client", async () => {
    proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    assert.equal(
      typeof proxy.createToolHandler,
      "function",
      "Should export createToolHandler(client)"
    );
  });

  it("handler returns guide text for intercepted tools without calling client", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));

    const clientCallTool = mock.fn(() => ({ content: [{ type: "text", text: "forwarded" }] }));
    const mockClient = { callTool: clientCallTool };

    const handler = proxy.createToolHandler(mockClient);
    const result = await handler("backlog_get_task_finalization_guide", {});

    // Should NOT have called the real client
    assert.equal(clientCallTool.mock.callCount(), 0, "Should not forward intercepted tools to client");

    // Should return guide content
    assert.ok(result, "Should return a result");
    assert.ok(
      result.content && result.content[0] && result.content[0].text,
      "Result should have MCP content structure"
    );
    assert.ok(
      result.content[0].text.includes("backlog_task_complete"),
      "Intercepted tool should return corrected guide text"
    );
  });

  it("handler forwards non-intercepted tools to the client", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));

    const clientCallTool = mock.fn(() => ({
      content: [{ type: "text", text: "real response" }],
    }));
    const mockClient = { callTool: clientCallTool };

    const handler = proxy.createToolHandler(mockClient);
    const result = await handler("backlog_task_list", { status: "To Do" });

    assert.equal(clientCallTool.mock.callCount(), 1, "Should forward to client");
    assert.deepEqual(
      clientCallTool.mock.calls[0].arguments,
      [{ name: "backlog_task_list", arguments: { status: "To Do" } }],
      "Should forward tool name and arguments"
    );
    assert.equal(result.content[0].text, "real response");
  });
});
