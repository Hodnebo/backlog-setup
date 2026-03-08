---
id: TASK-18
title: Prefer semantic search as primary task search method
status: Done
assignee: []
created_date: '2026-03-08 08:36'
updated_date: '2026-03-08 08:44'
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
- [x] #1 Semantic search (backlog_semantic_search) is called first or as the primary method when searching for tasks
- [x] #2 Keyword search (backlog_task_search) is used as a supplementary/secondary search, not the lead
- [x] #3 Search results are still comprehensive — both methods can be used in parallel, but semantic search results are given priority in the response
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rewrote `skills/backlog-semantic-search.md` to establish `backlog_semantic_search` as the PRIMARY search method (was previously presented as equal to keyword search). The skill now opens with \"Always start with backlog_semantic_search\", labels it as Primary Tool, and demotes `backlog_task_search` to Secondary Tool for exact ID lookups and structured filtering only. Decision flow updated: any search query goes to semantic first, with keyword search as the sole exception for known task IDs.\n\nUpdated `README.md` search comparison section to match — table headers now show \"(primary)\" and \"(supplementary)\", added a \"When\" row, and intro text states semantic search is the primary method.\n\nFiles changed:\n- `skills/backlog-semantic-search.md` — full rewrite\n- `README.md` — updated \"Semantic search vs keyword search\" section
<!-- SECTION:FINAL_SUMMARY:END -->
