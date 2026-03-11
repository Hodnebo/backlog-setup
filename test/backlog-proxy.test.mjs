import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// The 4 workflow guide tools that the proxy should intercept.
// These are the UPSTREAM MCP tool names (no "backlog_" prefix).
// MCP clients (OpenCode, Claude Code) add the server-name prefix for
// disambiguation, but the proxy sees the raw names.
// ---------------------------------------------------------------------------

const WORKFLOW_GUIDE_TOOLS = [
  "get_workflow_overview",
  "get_task_creation_guide",
  "get_task_execution_guide",
  "get_task_finalization_guide",
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

  it("exports isDoneViaEdit function", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    assert.equal(typeof proxy.isDoneViaEdit, "function");
  });

  it("exports rewriteToolList function", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    assert.equal(typeof proxy.rewriteToolList, "function");
  });

  it("exports DONE_VIA_EDIT_ERROR string", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    assert.equal(typeof proxy.DONE_VIA_EDIT_ERROR, "string");
    assert.ok(proxy.DONE_VIA_EDIT_ERROR.length > 0);
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
      "task_create",
      "task_edit",
      "task_list",
      "task_view",
      "semantic_search",
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
    const content = proxy.getGuideOverride("get_task_finalization_guide");
    assert.ok(
      content.includes("backlog_task_complete"),
      "Finalization guide override should mention backlog_task_complete"
    );
  });

  it("finalization guide override warns against backlog_task_edit for Done", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    const content = proxy.getGuideOverride("get_task_finalization_guide");
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
    const content = proxy.getGuideOverride("get_workflow_overview");
    assert.ok(
      content.includes("backlog_task_complete"),
      "Workflow overview override should mention backlog_task_complete"
    );
  });
});

// ---------------------------------------------------------------------------
// isDoneViaEdit detection
// ---------------------------------------------------------------------------

describe("backlog-proxy — isDoneViaEdit", () => {
  let proxy;

  it("detects status='Done' on task_edit", async () => {
    proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    assert.equal(
      proxy.isDoneViaEdit("task_edit", { id: "TASK-1", status: "Done" }),
      true
    );
  });

  it("detects case-insensitive variants", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    for (const variant of ["done", "DONE", "Done", " Done ", " done "]) {
      assert.equal(
        proxy.isDoneViaEdit("task_edit", { id: "TASK-1", status: variant }),
        true,
        `Should detect status="${variant}"`
      );
    }
  });

  it("returns false for other statuses", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    for (const status of ["To Do", "In Progress", "Draft"]) {
      assert.equal(
        proxy.isDoneViaEdit("task_edit", { id: "TASK-1", status }),
        false,
        `Should not block status="${status}"`
      );
    }
  });

  it("returns false for other tool names", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    assert.equal(
      proxy.isDoneViaEdit("task_create", { status: "Done" }),
      false
    );
    assert.equal(
      proxy.isDoneViaEdit("task_complete", { id: "TASK-1" }),
      false
    );
  });

  it("returns false for missing or null args", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    assert.equal(proxy.isDoneViaEdit("task_edit", null), false);
    assert.equal(proxy.isDoneViaEdit("task_edit", undefined), false);
    assert.equal(proxy.isDoneViaEdit("task_edit", {}), false);
  });

  it("returns false when status is not a string", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    assert.equal(
      proxy.isDoneViaEdit("task_edit", { id: "TASK-1", status: 42 }),
      false
    );
  });
});

// ---------------------------------------------------------------------------
// rewriteToolList
// ---------------------------------------------------------------------------

describe("backlog-proxy — rewriteToolList", () => {
  let proxy;

  /** Minimal upstream tool list that mimics the real backlog MCP output. */
  function fakeToolList() {
    return {
      tools: [
        {
          name: "task_edit",
          description: "Edit a task",
          inputSchema: {
            properties: {
              id: { type: "string" },
              status: {
                description: "Status value",
                enum: ["Draft", "To Do", "In Progress", "Done"],
                enumCaseInsensitive: true,
              },
            },
          },
        },
        {
          name: "task_complete",
          description: "Complete a task",
          inputSchema: { properties: { id: { type: "string" } } },
        },
        {
          name: "task_list",
          description: "List tasks",
          inputSchema: { properties: {} },
        },
      ],
    };
  }

  it("removes Done from task_edit status enum", async () => {
    proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    const result = proxy.rewriteToolList(fakeToolList());
    const editTool = result.tools.find((t) => t.name === "task_edit");
    const statusEnum = editTool.inputSchema.properties.status.enum;
    assert.ok(
      !statusEnum.some((v) => v.toLowerCase() === "done"),
      `Status enum should not contain Done, got: [${statusEnum}]`
    );
  });

  it("preserves other status values in the enum", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    const result = proxy.rewriteToolList(fakeToolList());
    const editTool = result.tools.find((t) => t.name === "task_edit");
    const statusEnum = editTool.inputSchema.properties.status.enum;
    assert.ok(statusEnum.includes("Draft"));
    assert.ok(statusEnum.includes("To Do"));
    assert.ok(statusEnum.includes("In Progress"));
  });

  it("appends warning to task_edit status description", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    const result = proxy.rewriteToolList(fakeToolList());
    const editTool = result.tools.find((t) => t.name === "task_edit");
    const desc = editTool.inputSchema.properties.status.description;
    assert.ok(
      desc.includes("task_complete"),
      `Status description should mention task_complete, got: "${desc}"`
    );
  });

  it("enhances task_complete description", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    const result = proxy.rewriteToolList(fakeToolList());
    const completeTool = result.tools.find((t) => t.name === "task_complete");
    assert.ok(
      completeTool.description.includes("REQUIRED"),
      `Complete tool description should include REQUIRED, got: "${completeTool.description}"`
    );
    assert.ok(
      completeTool.description.includes("task_edit"),
      "Complete tool description should warn against task_edit"
    );
  });

  it("does not mutate the original input", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    const original = fakeToolList();
    const originalEnum = [...original.tools[0].inputSchema.properties.status.enum];
    proxy.rewriteToolList(original);
    assert.deepEqual(
      original.tools[0].inputSchema.properties.status.enum,
      originalEnum,
      "Original tool list should not be mutated"
    );
  });

  it("leaves unrelated tools unchanged", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    const result = proxy.rewriteToolList(fakeToolList());
    const listTool = result.tools.find((t) => t.name === "task_list");
    assert.equal(listTool.description, "List tasks");
  });

  it("handles missing/null input gracefully", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    assert.equal(proxy.rewriteToolList(null), null);
    assert.equal(proxy.rewriteToolList(undefined), undefined);
    const noTools = { tools: null };
    assert.deepEqual(proxy.rewriteToolList(noTools), noTools);
  });

  it("handles tool without inputSchema or status property", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    const list = {
      tools: [
        { name: "task_edit", description: "Edit" },
        { name: "task_complete", description: "Complete" },
      ],
    };
    // Should not throw
    const result = proxy.rewriteToolList(list);
    assert.ok(result.tools.length === 2);
  });

  it("is idempotent — running twice produces the same result", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));
    const first = proxy.rewriteToolList(fakeToolList());
    const second = proxy.rewriteToolList(first);
    const editFirst = first.tools.find((t) => t.name === "task_edit");
    const editSecond = second.tools.find((t) => t.name === "task_edit");
    assert.deepEqual(
      editFirst.inputSchema.properties.status.enum,
      editSecond.inputSchema.properties.status.enum
    );
    assert.equal(
      editFirst.inputSchema.properties.status.description,
      editSecond.inputSchema.properties.status.description
    );
    const completeFirst = first.tools.find((t) => t.name === "task_complete");
    const completeSecond = second.tools.find((t) => t.name === "task_complete");
    assert.equal(completeFirst.description, completeSecond.description);
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
    const result = await handler("get_task_finalization_guide", {});

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
    const result = await handler("task_list", { status: "To Do" });

    assert.equal(clientCallTool.mock.callCount(), 1, "Should forward to client");
    assert.deepEqual(
      clientCallTool.mock.calls[0].arguments,
      [{ name: "task_list", arguments: { status: "To Do" } }],
      "Should forward tool name and arguments"
    );
    assert.equal(result.content[0].text, "real response");
  });

  it("handler auto-chains task_edit with status Done into task_complete", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));

    const clientCallTool = mock.fn((opts) => {
      if (opts.name === "task_edit") {
        return { content: [{ type: "text", text: "status updated" }] };
      }
      if (opts.name === "task_complete") {
        return { content: [{ type: "text", text: "task completed" }] };
      }
      return { content: [{ type: "text", text: "unexpected" }] };
    });
    const mockClient = { callTool: clientCallTool };

    const handler = proxy.createToolHandler(mockClient);
    const result = await handler("task_edit", {
      id: "TASK-1",
      status: "Done",
    });

    // Should have called BOTH task_edit and task_complete
    assert.equal(
      clientCallTool.mock.callCount(),
      2,
      "Should call task_edit then task_complete"
    );
    assert.equal(
      clientCallTool.mock.calls[0].arguments[0].name,
      "task_edit",
      "First call should be task_edit"
    );
    assert.equal(
      clientCallTool.mock.calls[1].arguments[0].name,
      "task_complete",
      "Second call should be task_complete"
    );
    assert.deepEqual(
      clientCallTool.mock.calls[1].arguments[0].arguments,
      { id: "TASK-1" },
      "task_complete should receive the task id"
    );

    // Result should include the notice
    assert.ok(
      result.content[0].text.includes("automatically upgraded"),
      "Result should include upgrade notice"
    );
    assert.ok(
      !result.isError,
      "Result should NOT be an error (auto-chain succeeds)"
    );
  });

  it("handler allows task_edit with non-Done status", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));

    const clientCallTool = mock.fn(() => ({
      content: [{ type: "text", text: "edit succeeded" }],
    }));
    const mockClient = { callTool: clientCallTool };

    const handler = proxy.createToolHandler(mockClient);
    const result = await handler("task_edit", {
      id: "TASK-1",
      status: "In Progress",
    });

    assert.equal(clientCallTool.mock.callCount(), 1, "Should forward non-Done edits");
    assert.equal(result.content[0].text, "edit succeeded");
  });

  it("handler allows task_edit without status field", async () => {
    if (!proxy) proxy = await import(join(ROOT, "lib/backlog-proxy.mjs"));

    const clientCallTool = mock.fn(() => ({
      content: [{ type: "text", text: "edit succeeded" }],
    }));
    const mockClient = { callTool: clientCallTool };

    const handler = proxy.createToolHandler(mockClient);
    const result = await handler("task_edit", {
      id: "TASK-1",
      title: "New title",
    });

    assert.equal(clientCallTool.mock.callCount(), 1, "Should forward edits without status");
    assert.equal(result.content[0].text, "edit succeeded");
  });
});
