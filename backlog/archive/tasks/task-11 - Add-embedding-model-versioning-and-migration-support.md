---
id: TASK-11
title: Add embedding model versioning and migration support
status: To Do
assignee: []
created_date: '2026-03-07 21:28'
updated_date: '2026-03-08 08:37'
labels:
  - enhancement
  - rag-server
dependencies: []
priority: medium
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Switching to a better embedding model would orphan the existing .lancedb vector store since embeddings from different models are incompatible. Add a version marker to the vector DB and a rebuild-on-change mechanism so future model upgrades are handled gracefully.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Current model name is stored as metadata in .lancedb (e.g. in .ingest-hashes.json or separate marker file)
- [ ] #2 On startup, if configured model differs from stored model, all existing data is purged and re-ingested
- [ ] #3 Model change triggers a clear log message explaining the full re-ingestion
- [ ] #4 Hash cache is invalidated on model change to force re-ingestion of all files
- [ ] #5 No action taken if model matches (zero overhead for normal startups)
<!-- AC:END -->
