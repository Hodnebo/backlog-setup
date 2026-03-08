---
id: TASK-10
title: Support additional file types for ingestion
status: To Do
assignee: []
created_date: '2026-03-07 21:28'
updated_date: '2026-03-08 08:37'
labels:
  - enhancement
  - rag-server
dependencies: []
priority: medium
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Only .md, .txt, .pdf, .docx files are discovered and ingested today. Projects that store documentation or structured data in .json, .yaml, .xml, or .html formats cannot benefit from semantic search. Extend the file discovery to support additional common documentation formats.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 .json, .yaml/.yml, .html file types are discovered during recursive scan
- [ ] #2 New file types are ingested via ingest_file (no special preprocessing needed)
- [ ] #3 Supported file types are configurable via environment variable
- [ ] #4 README documents the full list of supported file types
- [ ] #5 Existing .md/.txt/.pdf/.docx behavior is unchanged
<!-- AC:END -->
