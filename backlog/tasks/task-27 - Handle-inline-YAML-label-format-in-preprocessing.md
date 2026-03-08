---
id: TASK-27
title: Handle inline YAML label format in preprocessing
status: To Do
assignee: []
created_date: '2026-03-08 14:32'
labels:
  - enhancement
  - rag-server
dependencies: []
references:
  - lib/preprocessing.mjs
  - test/preprocessing.test.mjs
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Label extraction in lib/preprocessing.mjs only matches the YAML list format (labels:\n  - foo\n  - bar). Inline format (labels: [foo, bar]) is valid YAML that Backlog.md could produce depending on editor/platform, but labels are silently dropped from the preprocessed text. This degrades search quality since label terms aren't included in the embedding.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Inline YAML labels (labels: [foo, bar]) are extracted correctly
- [ ] #2 Existing YAML list format (labels:\n  - foo) still works
- [ ] #3 Preprocessing tests cover both formats
- [ ] #4 No new dependencies (no js-yaml — regex is fine)
<!-- AC:END -->
