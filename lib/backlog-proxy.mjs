/**
 * Backlog MCP proxy — intercepts workflow guide tools and returns
 * corrected guide text that instructs agents to use
 * `backlog_task_complete` instead of `backlog_task_edit` for
 * marking tasks done.
 *
 * Also enforces this at the action layer:
 *  - Intercepts `backlog_task_complete` and auto-sets status to "Done"
 *    before forwarding (upstream requires Done status)
 *  - Rejects `backlog_task_edit` calls that set status to "Done"
 *  - Rewrites tool listings to remove "Done" from the edit tool's
 *    status enum and enhance the complete tool's description
 *
 * Exports:
 *   GUIDE_TOOL_NAMES    — array of the 4 intercepted tool names
 *   getGuideOverride     — returns corrected text (string) or null
 *   createToolHandler    — wraps a client to intercept guide tools
 *   rewriteToolList      — patches tool descriptions for enforcement
 *   isDoneViaEdit        — detects status="Done" in task_edit args
 *   DONE_VIA_EDIT_ERROR  — error message returned for blocked calls
 *
 * When run as main (`node lib/backlog-proxy.mjs`), starts a full
 * MCP stdio proxy that spawns `backlog mcp start` as the upstream.
 */

import {
  WORKFLOW_OVERVIEW_GUIDE,
  TASK_CREATION_GUIDE,
  TASK_EXECUTION_GUIDE,
  TASK_FINALIZATION_GUIDE,
} from "./workflow-guides.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GUIDE_TOOL_NAMES = [
  "get_workflow_overview",
  "get_task_creation_guide",
  "get_task_execution_guide",
  "get_task_finalization_guide",
];

/** @type {Record<string, string>} */
const GUIDE_MAP = {
  get_workflow_overview: WORKFLOW_OVERVIEW_GUIDE,
  get_task_creation_guide: TASK_CREATION_GUIDE,
  get_task_execution_guide: TASK_EXECUTION_GUIDE,
  get_task_finalization_guide: TASK_FINALIZATION_GUIDE,
};

const DONE_VIA_EDIT_ERROR =
  "ERROR: Do not use backlog_task_edit to set status to Done. " +
  "Use backlog_task_complete instead — it moves the task to the " +
  "completed folder and removes it from the search index.";

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Return corrected guide text for a workflow guide tool, or null if
 * the tool is not one of the 4 intercepted guides.
 *
 * @param {string} toolName
 * @returns {string | null}
 */
function getGuideOverride(toolName) {
  return GUIDE_MAP[toolName] ?? null;
}

// ---------------------------------------------------------------------------
// Edit-to-Done detection
// ---------------------------------------------------------------------------

/**
 * Return true when toolName is `backlog_task_edit` and the arguments
 * include a status that normalises to "done".
 *
 * @param {string} toolName
 * @param {unknown} args
 * @returns {boolean}
 */
function isDoneViaEdit(toolName, args) {
  if (toolName !== "task_edit") return false;
  if (args == null || typeof args !== "object") return false;
  const status = /** @type {Record<string, unknown>} */ (args).status;
  return typeof status === "string" && status.toLowerCase().trim() === "done";
}

// ---------------------------------------------------------------------------
// Tool-list rewriting
// ---------------------------------------------------------------------------

/**
 * Patch the upstream tool list so that:
 *  1. `backlog_task_edit`'s `status` enum no longer contains "Done"
 *     and its description warns against using it for completion.
 *  2. `backlog_task_complete`'s description is enhanced to make it
 *     the obvious choice for finishing tasks.
 *
 * Returns a new object — never mutates the input.
 *
 * @param {{ tools: Array<{ name: string, description?: string, inputSchema?: object }> }} listResult
 * @returns {{ tools: Array<{ name: string, description?: string, inputSchema?: object }> }}
 */
function rewriteToolList(listResult) {
  if (!listResult || !Array.isArray(listResult.tools)) return listResult;

  const tools = listResult.tools.map((tool) => {
    // --- backlog_task_edit: strip "Done" from status enum -----------------
    if (tool.name === "task_edit") {
      const patched = structuredClone(tool);

      // Remove "Done" from the status property's enum (if present)
      const statusProp = patched.inputSchema?.properties?.status;
      if (statusProp && Array.isArray(statusProp.enum)) {
        statusProp.enum = statusProp.enum.filter(
          (v) => typeof v !== "string" || v.toLowerCase() !== "done"
        );
      }
      if (statusProp && Array.isArray(statusProp.enumCaseInsensitive)) {
        statusProp.enumCaseInsensitive = statusProp.enumCaseInsensitive.filter(
          (v) => typeof v !== "string" || v.toLowerCase() !== "done"
        );
      }

      // Append warning to status description
      if (statusProp) {
        const base = statusProp.description || "";
        if (!base.includes("backlog_task_complete")) {
          statusProp.description =
            base.replace(/\s*$/, "") +
            ". To finish a task use backlog_task_complete instead of setting status to Done";
        }
      }

      return patched;
    }

    // --- backlog_task_complete: enhance description -----------------------
    if (tool.name === "task_complete") {
      const patched = structuredClone(tool);
      const desc = patched.description || "";
      if (!desc.includes("REQUIRED")) {
        patched.description =
          "REQUIRED for finishing tasks. Moves the task to the completed folder " +
          "and removes it from the search index. Do NOT use backlog_task_edit " +
          "with status Done — always use this tool instead.";
      }
      return patched;
    }

    return tool;
  });

  return { ...listResult, tools };
}

// ---------------------------------------------------------------------------
// Tool handler factory
// ---------------------------------------------------------------------------

/**
 * Create a tool dispatch function that:
 *  1. Intercepts guide tools → returns corrected text
 *  2. Intercepts `task_complete` → auto-sets status to "Done" via
 *     `task_edit` before forwarding (upstream requires Done status)
 *  3. Blocks `task_edit` with status "Done" → returns hard error
 *  4. Forwards everything else to the upstream MCP client
 *
 * @param {{ callTool: (opts: { name: string, arguments: unknown }) => unknown }} client
 * @returns {(toolName: string, args: unknown) => Promise<{ content: Array<{ type: string, text: string }>, isError?: boolean }>}
 */
function createToolHandler(client) {
  return async function handleTool(toolName, args) {
    const override = getGuideOverride(toolName);
    if (override !== null) {
      return { content: [{ type: "text", text: override }] };
    }
    if (isDoneViaEdit(toolName, args)) {
      return {
        content: [{ type: "text", text: DONE_VIA_EDIT_ERROR }],
        isError: true,
      };
    }
    if (toolName === "task_complete") {
      const id = /** @type {Record<string, unknown>} */ (args).id;
      // Auto-set status to Done first (upstream requires it).
      // This is safe even if already Done — task_edit is a no-op for
      // same-status updates.
      await client.callTool({
        name: "task_edit",
        arguments: { id, status: "Done" },
      });
      return client.callTool({ name: "task_complete", arguments: { id } });
    }
    return client.callTool({ name: toolName, arguments: args });
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  GUIDE_TOOL_NAMES,
  DONE_VIA_EDIT_ERROR,
  getGuideOverride,
  isDoneViaEdit,
  rewriteToolList,
  createToolHandler,
};

// ---------------------------------------------------------------------------
// Main — stdio MCP proxy (only when run directly)
// ---------------------------------------------------------------------------

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isMain) {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");

  // Spawn upstream backlog MCP
  const transport = new StdioClientTransport({
    command: "backlog",
    args: ["mcp", "start"],
    env: { ...process.env },
  });
  const client = new Client({ name: "backlog-proxy", version: "1.0.0" });
  await client.connect(transport);

  // Create proxy server
  const server = new Server(
    { name: "backlog-proxy", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // List tools — rewrite descriptions to enforce completion policy
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const upstream = await client.listTools();
    return rewriteToolList(upstream);
  });

  // Call tool — intercept guides, forward the rest
  const handler = createToolHandler(client);
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handler(name, args);
  });

  const serverTransport = new StdioServerTransport();
  await server.connect(serverTransport);

  process.stderr.write("[backlog-proxy] MCP proxy started\n");
}
