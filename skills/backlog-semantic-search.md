---
name: backlog-semantic-search
description: >
  MANDATORY: Use backlog_semantic_search as the PRIMARY search tool for all backlog queries.
  Do NOT call backlog_task_search in parallel — call semantic search first, then keyword search
  only if needed. Triggers on: "search tasks", "find tasks", "look for tasks", "query backlog",
  "search backlog", "related tasks", "similar tasks", "tasks about", "tasks related to",
  or any task discovery intent.
---

# Backlog Search: Semantic First

**RULE: Always call `backlog_semantic_search` FIRST. Do NOT call `backlog_task_search` alongside it.**

Semantic search finds results by meaning, synonyms, and conceptual similarity. Keyword search (`backlog_task_search`) is a fallback for exact ID lookups only.

## MUST DO

- Call `backlog_semantic_search` as your FIRST and PRIMARY search tool
- Wait for semantic results before deciding if keyword search is needed
- Use descriptive phrases, not single keywords ("tasks about improving API response time" not "performance")

## MUST NOT DO

- Do NOT call `backlog_task_search` in parallel with `backlog_semantic_search`
- Do NOT use `backlog_task_search` as your first search call (unless looking up an exact task ID like "TASK-42")
- Do NOT treat both tools as equals — semantic search is primary, keyword search is fallback

## When to Use Each

### `backlog_semantic_search` — PRIMARY (use first, every time)
- Any search query, conceptual or specific
- Natural language questions ("what needs to be done for the API?")
- Topic exploration ("security concerns", "user experience issues")
- Finding related/similar tasks without knowing exact wording

**Scoring**: 0 = best match. 0-0.5 = strong, 0.5-1.0 = moderate, >1.0 = weak.

### `backlog_task_search` — FALLBACK ONLY
- Looking up a specific task ID ("TASK-15") — this is the ONLY case to use it first
- Semantic results were insufficient and you need exact keyword matching
- Structured filtering by status, priority, or labels (or use `backlog_task_list` with filters)

## Decision Flow

1. **Any search** → `backlog_semantic_search` first
2. **Know exact task ID?** → `backlog_task_search` (only exception)
3. **Need status/priority filter?** → `backlog_task_list` with filters
4. **Semantic results insufficient?** → Then try `backlog_task_search` as a second pass
