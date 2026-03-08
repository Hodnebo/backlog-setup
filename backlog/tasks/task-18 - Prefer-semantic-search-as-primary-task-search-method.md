---
id: TASK-18
title: Prefer semantic search as primary task search method
status: To Do
assignee: []
created_date: '2026-03-08 08:36'
updated_date: '2026-03-08 08:37'
labels:
  - enhancement
  - agent-workflow
dependencies: []
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When searching for backlog tasks, the semantic search (local-rag backlog_semantic_search) should be the first and preferred tool call, not keyword-based backlog_task_search. Semantic search returns better ranked results by meaning and conceptual similarity, while keyword search requires exact/fuzzy term matches and often misses relevant tasks.

Currently the agent tends to fire backlog_task_search first (or in parallel with semantic search). The semantic search should be prioritized because:
1. It finds results by meaning, synonyms, and conceptual similarity — not just keyword overlap
2. It returns relevance scores so results can be ranked by quality
3. It catches tasks that use different terminology for the same concept
4. Keyword search can supplement as a secondary/parallel call but should not be the lead method
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Semantic search (backlog_semantic_search) is called first or as the primary method when searching for tasks
- [ ] #2 Keyword search (backlog_task_search) is used as a supplementary/secondary search, not the lead
- [ ] #3 Search results are still comprehensive — both methods can be used in parallel, but semantic search results are given priority in the response
<!-- AC:END -->
