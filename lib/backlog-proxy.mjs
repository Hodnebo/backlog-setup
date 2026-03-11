/**
 * Backlog MCP proxy — intercepts workflow guide tools and returns
 * corrected guide text that instructs agents to use
 * `backlog_task_complete` instead of `backlog_task_edit` for
 * marking tasks done.
 *
 * Exports:
 *   GUIDE_TOOL_NAMES  — array of the 4 intercepted tool names
 *   getGuideOverride   — returns corrected text (string) or null
 *   createToolHandler  — wraps a client to intercept guide tools
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
  "backlog_get_workflow_overview",
  "backlog_get_task_creation_guide",
  "backlog_get_task_execution_guide",
  "backlog_get_task_finalization_guide",
];

/** @type {Record<string, string>} */
const GUIDE_MAP = {
  backlog_get_workflow_overview: WORKFLOW_OVERVIEW_GUIDE,
  backlog_get_task_creation_guide: TASK_CREATION_GUIDE,
  backlog_get_task_execution_guide: TASK_EXECUTION_GUIDE,
  backlog_get_task_finalization_guide: TASK_FINALIZATION_GUIDE,
};

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
// Tool handler factory
// ---------------------------------------------------------------------------

/**
 * Create a tool dispatch function that intercepts guide tools and
 * forwards everything else to the upstream MCP client.
 *
 * @param {{ callTool: (opts: { name: string, arguments: unknown }) => unknown }} client
 * @returns {(toolName: string, args: unknown) => Promise<{ content: Array<{ type: string, text: string }> }>}
 */
function createToolHandler(client) {
  return async function handleTool(toolName, args) {
    const override = getGuideOverride(toolName);
    if (override !== null) {
      return { content: [{ type: "text", text: override }] };
    }
    return client.callTool({ name: toolName, arguments: args });
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  GUIDE_TOOL_NAMES,
  getGuideOverride,
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

  // List tools — pass through from upstream
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return client.listTools();
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
