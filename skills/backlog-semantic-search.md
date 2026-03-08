---
name: backlog-semantic-search
description: >
  Guide for searching backlog tasks effectively using two complementary search tools.
  Use when searching tasks, finding work items, querying the backlog, or when search
  results from one tool are insufficient. Triggers on: "search tasks", "find tasks",
  "look for tasks", "query backlog", "search backlog", "related tasks", "similar tasks",
  "tasks about", "tasks related to", or any task discovery intent.
---

# Backlog Search: Semantic vs Keyword

Two search tools exist for backlog tasks. Use both strategically.

## Tool Comparison

| | `backlog_semantic_search` | `backlog_task_search` |
|---|---|---|
| **Engine** | Vector embeddings (LanceDB) | Fuzzy keyword (Fuse.js, Bitap) |
| **Strengths** | Synonyms, concepts, intent, natural language | Exact IDs, titles, labels, known keywords |
| **Scoring** | 0 = best, higher = worse | threshold 0.35 |
| **Best for** | "tasks about performance" | "TASK-42", "authentication" |

## When to Use Each

### Use `backlog_semantic_search` when:
- Query is conceptual or descriptive ("things that slow down the app")
- Looking for related/similar tasks without knowing exact wording
- Exploring a topic area ("security concerns", "user experience issues")
- Previous keyword search returned no results or irrelevant results
- Natural language questions ("what needs to be done for the API?")

### Use `backlog_task_search` when:
- Looking up a specific task ID ("TASK-15")
- Searching for exact title text or label names
- Filtering by known keywords that appear literally in tasks
- Need structured filtering (by status, priority, labels)

## Decision Flow

1. Know the exact ID or title? -> `backlog_task_search`
2. Conceptual or exploratory query? -> `backlog_semantic_search`
3. Keyword search returned poor results? -> Try `backlog_semantic_search`
4. Semantic search too broad? -> Refine with `backlog_task_search`

## Tips

- Semantic search works best with descriptive phrases, not single words
- Combine both tools: semantic to discover, keyword to filter/verify
- Semantic search scores: 0-0.5 = strong match, 0.5-1.0 = moderate, >1.0 = weak
