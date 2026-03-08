---
id: TASK-14
title: Rewrite rag-server.mjs to expose backlog-named MCP tools
status: Done
assignee: []
created_date: '2026-03-08 08:01'
updated_date: '2026-03-08 08:04'
labels:
  - implementation
  - mcp
  - rag
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the current `startServer()` call with a custom MCP server that wraps RAGServer's handler methods with backlog-specific tool names and descriptions. Lift RAGServer instance from autoIngest() to module scope so both auto-ingestion and the custom MCP server share the same instance (avoiding double model load). Expose `backlog_semantic_search` as the primary tool with a description that makes AI agents understand it's for searching backlog tasks semantically.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 RAGServer instance is created once and shared between autoIngest and MCP server
- [x] #2 backlog_semantic_search tool wraps handleQueryDocuments with backlog-specific description
- [x] #3 All logging goes to stderr (stdout reserved for MCP stdio)
- [x] #4 No new npm dependencies (uses SDK already in node_modules via mcp-local-rag)
- [x] #5 ESM .mjs style with node: protocol imports and code style per AGENTS.md
- [x] #6 Auto-ingest runs before MCP server starts listening
- [x] #7 Tool description clearly signals 'backlog tasks' and 'semantic/conceptual search'
<!-- AC:END -->
