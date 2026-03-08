/**
 * Corrected workflow guide text constants.
 *
 * The upstream Backlog.md MCP server returns guide text that instructs
 * agents to mark tasks "Done" via `backlog_task_edit`.  The correct
 * tool for that is `backlog_task_complete`.  This module exports the
 * four guide constants with that correction applied, plus a warning
 * that makes the right tool unambiguous.
 */

// ---------------------------------------------------------------------------
// Workflow Overview
// ---------------------------------------------------------------------------

const WORKFLOW_OVERVIEW_GUIDE = `## Backlog.md Overview (Tools)

Your client is using Backlog.md via tools. Use the following MCP tools to retrieve guidance and manage tasks.

### When to Use Backlog

**Create a task if the work requires planning or decision-making.** Ask yourself: "Do I need to think about HOW to do this?"

- **YES** → Search for existing task first, create if needed
- **NO** → Just do it (the change is trivial/mechanical)

**Examples of work that needs tasks:**
- "Fix the authentication bug" → need to investigate, understand root cause, choose fix
- "Add error handling to the API" → need to decide what errors, how to handle them
- "Refactor UserService" → need to plan new structure, migration path

**Examples of work that doesn't need tasks:**
- "Fix typo in README" → obvious mechanical change
- "Update version number to 2.0" → straightforward edit
- "Add missing semicolon" → clear what to do

**Always skip tasks for:** questions, exploratory requests, or knowledge transfer only.

### Core Workflow Tools

Use these tools to retrieve the required Backlog.md guidance in markdown form:

- \`get_workflow_overview\` — Overview of when and how to use Backlog
- \`get_task_creation_guide\` — Detailed instructions for creating tasks (scope, acceptance criteria, structure)
- \`get_task_execution_guide\` — Planning and executing tasks (implementation plans, approvals, scope changes)
- \`get_task_finalization_guide\` — Definition of Done, finalization workflow, next steps

Each tool returns the same content that resource-capable clients read via \`backlog://workflow/...\` URIs.

### Typical Workflow (Tools)

1. **Search first:** call \`task_search\` or \`task_list\` with filters to find existing work
2. **If found:** read details via \`task_view\`; follow execution/plan guidance from the retrieved markdown
3. **If not found:** consult \`get_task_creation_guide\`, then create tasks with \`task_create\`
4. **Execute & finalize:** use the execution/finalization guides to manage status, plans, notes, and acceptance criteria via \`task_edit\`; when a task is fully done use \`backlog_task_complete\` to mark it complete

**Note:** When a task is finished, use \`backlog_task_complete\` to move it to the completed folder. Do NOT set status to "Done" via \`backlog_task_edit\` — use \`backlog_task_complete\` instead. Do not use \`task_archive\` for completed work—archive is only for duplicate, canceled, or invalid tasks.

### Core Principle

Backlog tracks **commitments** (what will be built). Use your judgment to distinguish between "help me understand X" (no task) vs "add feature Y" (create tasks).

### MCP Tools Quick Reference

- \`get_workflow_overview\`, \`get_task_creation_guide\`, \`get_task_execution_guide\`, \`get_task_finalization_guide\`
- \`task_list\`, \`task_search\`, \`task_view\`, \`task_create\`, \`task_edit\`, \`task_complete\`, \`task_archive\`
- \`document_list\`, \`document_view\`, \`document_create\`, \`document_update\`, \`document_search\`
- \`definition_of_done_defaults_get\`, \`definition_of_done_defaults_upsert\`

**Definition of Done support**
- \`definition_of_done_defaults_get\` reads project-level DoD defaults from config
- \`definition_of_done_defaults_upsert\` updates project-level DoD defaults in config
- \`task_create\` accepts \`definitionOfDoneAdd\` and \`disableDefinitionOfDoneDefaults\` for **exceptional** task-level DoD overrides only
- \`task_edit\` accepts \`definitionOfDoneAdd\`, \`definitionOfDoneRemove\`, \`definitionOfDoneCheck\`, \`definitionOfDoneUncheck\` for **exceptional** task-level DoD updates only
- DoD is a completion checklist, not acceptance criteria: keep scope/behavior in acceptance criteria, not DoD fields
- \`task_view\` output includes the Definition of Done checklist with checked state

**Always operate through the MCP tools above. Never edit markdown files directly; use the tools so relationships, metadata, and history stay consistent.**`;

// ---------------------------------------------------------------------------
// Task Creation Guide
// ---------------------------------------------------------------------------

const TASK_CREATION_GUIDE = `## Task Creation Guide

This guide provides detailed instructions for creating well-structured tasks. You should already know WHEN to create tasks (from the overview).

### Step 1: Search for existing work

**IMPORTANT - Always use filters when searching:**
- Use \`task_search\` with query parameter (e.g., query="desktop app")
- Use \`task_list\` with status filter to exclude completed work (e.g., status="To Do" or status="In Progress")
- Never list all tasks including "Done" status without explicit user request
- Never search without a query or limit - this can overwhelm the context window

Use \`task_view\` to read full context of related tasks.

### Step 2: Assess scope BEFORE creating tasks

**CRITICAL**: Before creating any tasks, assess whether the user's request is:
- **Single atomic task** (single focused PR): Create one task immediately
- **Multi-task feature or initiative** (multiple PRs, or parent task with subtasks): Create appropriate task structure

**Scope assessment checklist** - Answer these questions FIRST:
1. Can this be completed in a single focused pull request?
2. Would a code reviewer be comfortable reviewing all changes in one sitting?
3. Are there natural breaking points where work could be independently delivered and tested?
4. Does the request span multiple subsystems, layers, or architectural concerns?
5. Are multiple tasks working on the same component or closely related functionality?

If the work requires multiple tasks, proceed to choose the appropriate task structure (subtasks vs separate tasks).

### Agent Lifecycle Reality

**Assume the agent who creates tasks will NOT execute them.** Each task is handled by an independent agent session with no memory of prior conversations or other tasks.

- Write tasks as work orders for strangers: include all required context inside the task
- Never reference "what we discussed" without restating the essential decisions and constraints
- Dependencies must explicitly state what the other task provides (e.g., output, schema, artifact)
- Use the \`references\` field to link relevant code files or related issues
- Use the \`documentation\` field to link design docs, API specs, or other reference materials that help understand the task context

### Step 3: Choose task structure

**When to use subtasks vs separate tasks:**

**Use subtasks** (parent-child relationship) when:
- Multiple tasks all modify the same component or subsystem
- Tasks are tightly coupled and share the same high-level goal
- Tasks represent sequential phases of the same feature
- Example: Parent task "Desktop Application" with subtasks for Electron setup, IPC bridge, UI adaptation, packaging

**Use separate tasks** (with dependencies) when:
- Tasks span different components or subsystems
- Tasks can be worked on independently by different developers
- Tasks have loose coupling with clear boundaries
- Example: Separate tasks for "API endpoint", "Frontend component", "Documentation"

**Concrete example**: If a request spans multiple layers—say an API change, a client update, and documentation—create one parent task ("Launch bulk-edit mode") with subtasks for each layer. Note cross-layer dependencies (e.g., "UI waits on API schema") so different collaborators can work in parallel without blocking each other.

### Step 4: Create multi-task structure

When scope requires multiple tasks:
1. **Create the task structure**: Either parent task with subtasks, or separate tasks with dependencies
2. **Explain what you created** to the user after creation, including the reasoning for the structure
3. **Document relationships**: Record dependencies using \`task_edit\` so scheduling and merge-risk tooling stay accurate

**Follow-up work on an existing task:** Create it as a **subtask** of that parent task (not a new top-level task).

Create all tasks in the same session to maintain consistency and context.

### Step 5: Create task(s) with proper scope

**Title and description**: Explain desired outcome and user value (the WHY)

**Acceptance criteria**: Specific, testable, and independent (the WHAT)
- Keep each checklist item atomic (e.g., "Display saves when user presses Ctrl+S")
- Include negative or edge scenarios when relevant
- Capture testing expectations explicitly
- Include documentation expectations in the same task (no deferring to follow-up tasks)

**Definition of Done defaults (optional):**
- Project-level defaults are managed with \`definition_of_done_defaults_get\` / \`definition_of_done_defaults_upsert\`
- DoD is not acceptance criteria: AC defines product scope/behavior, DoD defines completion hygiene
- Per-task DoD customization should be exceptional; default to project-level DoD plus strong acceptance criteria
- Use \`definitionOfDoneAdd\` only for task-specific DoD items that apply to this one task
- Use \`disableDefinitionOfDoneDefaults\` to skip project defaults for this task when needed
- Do **not** duplicate project defaults into \`definitionOfDoneAdd\` unless you are intentionally customizing this task

**Never embed implementation details** in title, description, or acceptance criteria

**Record dependencies** using \`task_edit\` for task ordering

**Ask for clarification** if requirements are ambiguous

**Drafts (exceptional):** Default to creating regular tasks (e.g., To Do) for any work you are committing to track. Only create a Draft when the user explicitly requests a draft, or when there is clear uncertainty that makes a commitment inappropriate (e.g., missing requirements and the user wants a placeholder). Use \`task_create\` with status \`Draft\` to create a draft, \`task_edit\` to promote/demote by changing status, and pass status \`Draft\` to \`task_list\`/\`task_search\` to include drafts. Drafts are excluded unless explicitly filtered.

### Step 6: Report created tasks

After creation, show the user each new task's ID, title, description, and acceptance criteria (e.g., "Created task-290 – API endpoint: …"). This provides visibility into what was created and allows the user to request corrections if needed.

### Common Anti-patterns to Avoid

- Creating a single task called "Build desktop application" with 10+ acceptance criteria
- Adding implementation steps to acceptance criteria
- Creating a task before understanding if it needs to be split
- Deferring tests or documentation to "later tasks" (e.g., "Add tests/docs in a follow-up")

### Correct Pattern

"This request spans electron setup, IPC bridge, UI adaptation, and packaging. I'll create 4 separate tasks to break this down properly."

Then create the tasks and report what was created.

**Standalone task example (includes tests/docs):** "Add API endpoint for bulk updates" with acceptance criteria that include required tests and documentation updates in the same task.

### Additional Context Gathering

- Use \`task_view\` to read the description, acceptance criteria, dependencies, current plan, and notes before acting
- Inspect relevant code/docs/tests in the repository to ground your understanding
- When permitted, consult up-to-date external references (design docs, service manuals, API specs) so your plan reflects current reality`;

// ---------------------------------------------------------------------------
// Task Execution Guide
// ---------------------------------------------------------------------------

const TASK_EXECUTION_GUIDE = `## Task Execution Guide

### Planning Workflow

> **Non-negotiable:** Capture an implementation plan in the Backlog task _before_ writing any code or running commands. The plan must live in the task record prior to implementation and remain up to date when you close the task.

1. **Mark task as In Progress** via \`task_edit\` with status "In Progress"
2. **Assign to yourself** via \`task_edit\` with assignee field
3. **Review task references and documentation** - Check any \`references\` (related code, issues) and \`documentation\` (design docs, API specs) attached to the task before planning
4. **Draft the implementation plan** - Think through the approach, review code, identify key files
5. **Present plan to user** - Show your proposed implementation approach
6. **Wait for explicit approval** - Do not start coding until user confirms or asks you to skip review
7. **Record approved plan** - Use \`task_edit\` with planSet or planAppend to capture the agreed approach in the task
8. **Document the agreed breakdown** - In the parent task's plan, capture the final list of subtasks, owners, and sequencing so a replacement agent can resume with the approved structure

**IMPORTANT:** Use tasks as permanent storage for everything related to the work. You may be interrupted or replaced at any point, so the task record must contain everything needed for a clean handoff.

### Planning Guidelines

- Keep the Backlog task as the single plan of record: capture the agreed approach with \`task_edit\` (planSet field) before writing code
- Use \`task_edit\` (planAppend field) to refine the plan when you learn more during implementation
- Verify prerequisites before committing to a plan: confirm required tools, access, data, and environment support are in place
- Keep plans structured and actionable: list concrete steps, highlight key files, call out risks, and note any checkpoints or validations
- Ensure the plan reflects the agreed user outcome and acceptance criteria; if expectations are unclear, clarify them before proceeding
- When additional context is required, review relevant code, documentation, or external references so the plan incorporates the latest knowledge
- Treat the plan and acceptance criteria as living guides - update both when the approach or expectations change so future readers understand the rationale
- If you need to add or remove tasks or shift scope later, pause and run the "present → approval" loop again before editing the backlog; never change the breakdown silently

### Working with Subtasks (Planning)

- If working on a parent task with subtasks, create a high-level plan for the parent that outlines the overall approach
- Each subtask should have its own detailed implementation plan when you work on it
- Ensure subtask plans are consistent with the parent task's overall strategy

### Execution Workflow

- **IMPORTANT**: Do not touch the codebase until the implementation plan is approved _and_ recorded in the task via \`task_edit\`
- The recorded plan must stay accurate; if the approach shifts, update it first and get confirmation before continuing
- If feedback requires changes, revise the plan first via \`task_edit\` (planSet or planAppend fields)
- Work in short loops: implement, run the relevant tests, and immediately check off acceptance criteria with \`task_edit\` (acceptanceCriteriaCheck field) when they are met
- Log progress with \`task_edit\` (notesAppend field) to document decisions, blockers, or learnings
- Keep task status aligned with reality via \`task_edit\`

### Handling Scope Changes

If new work appears during implementation that wasn't in the original acceptance criteria:

**STOP and ask the user**:
"I discovered [new work needed]. Should I:
1. Add acceptance criteria to the current task and continue, or
2. Create a follow-up task to handle this separately?"

**Never**:
- Silently expand the scope without user approval
- Create new tasks on your own initiative
- Add acceptance criteria without user confirmation

### Staying on Track

- Stay within the scope defined by the plan and acceptance criteria
- Update the plan first if direction changes, then get user approval for the revised approach
- If you need to deviate from the plan, explain why and wait for confirmation

### Working with Subtasks (Execution)

- When user assigns you a parent task "and all subtasks", work through each subtask sequentially without asking for permission to move to the next one
- When completing a single subtask (without explicit instruction to continue), present progress and ask: "Subtask X is complete. Should I proceed with subtask Y, or would you like to review first?"
- Each subtask should be fully completed (all acceptance criteria met, tests passing) before moving to the next

### Finalizing the Task

When implementation is finished, follow the **Task Finalization Guide** (\`backlog://workflow/task-finalization\`) to finalize your work. This ensures acceptance criteria are verified, implementation is documented, and the task is properly closed with \`backlog_task_complete\`.`;

// ---------------------------------------------------------------------------
// Task Finalization Guide
// ---------------------------------------------------------------------------

const TASK_FINALIZATION_GUIDE = `## Task Finalization Guide

### Finalization Workflow

1. **Verify all acceptance criteria and Definition of Done items** - Confirm every checklist item is satisfied (use \`task_view\` to see current status; use \`definitionOfDoneCheck/Uncheck\` as needed)
2. **Run the Definition of Done checklist** (see below)
3. **Write the Final Summary** - Use \`task_edit\` (\`finalSummary\` field) to capture a PR-style summary of what changed and why. Avoid one-line summaries unless the change is trivial; include tests and key scope for reviewers.
4. **Confirm the implementation plan is captured and current** - Update the plan in Backlog if the executed approach deviated
5. **Complete the task** - Use \`backlog_task_complete\` to mark the task as complete and move it to the completed folder. Do NOT use \`backlog_task_edit\` with status "Done" — always use \`backlog_task_complete\` instead.
6. **Propose next steps** - Never autonomously create or start new tasks

**Important:** Do not use \`task_archive\` for completed work. Archive is only for tasks that should not be completed (duplicate, canceled, invalid).

### Definition of Done Checklist

- Implementation plan exists in the task record (\`task_edit\` planSet/planAppend) and reflects the final solution
- Acceptance criteria are all checked via \`task_edit\` (acceptanceCriteriaCheck field)
- Definition of Done items are all checked via \`task_edit\` (definitionOfDoneCheck field)
- Automated and relevant manual tests pass; no new warnings or regressions introduced
- Documentation or configuration updates completed when required
- Implementation notes capture progress during work via \`task_edit\` (notesAppend field)
- Final Summary captures the PR-style completion summary via \`task_edit\` (\`finalSummary\` field). Include what changed, why, tests run, and any risks/follow-ups when relevant.
- Task is completed via \`backlog_task_complete\`

### After Finalization

**Never autonomously create or start new tasks.** Instead:

- **If follow-up work is needed**: Present the idea to the user and ask whether to create a follow-up task
- **If this was a subtask**:
  - Check if user explicitly told you to work on "parent task and all subtasks"
    - If YES: Proceed directly to the next subtask without asking
    - If NO: Ask user: "Subtask X is complete. Should I proceed with subtask Y, or would you like to review first?"
- **If all subtasks in a series are complete**: Update parent task status if appropriate, then ask user what to do next

### Working with Subtasks

- When finalizing a subtask, check all its acceptance criteria individually
- Complete the subtask with \`backlog_task_complete\`
- Document subtask-specific outcomes in the subtask's notes
- Only complete the parent task when ALL subtasks are complete (or when explicitly instructed)

### Implementation notes vs Final Summary

Implementation notes are for progress logging during execution (decisions, blockers, learnings). The Final Summary is for the PR-style completion summary when the task is done.

Use \`task_edit\` (notesAppend field) to record:
- Implementation decisions and rationale
- Blockers encountered and how they were resolved
- Technical debt or future improvements identified
- Testing approach and results

These notes help future developers (including AI agents) understand the context.
Do not repeat the same information that is clearly understandable from the code.

Use \`task_edit\` (\`finalSummary\`) to write a structured PR-style summary that highlights the key points of the implementation.`;

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  WORKFLOW_OVERVIEW_GUIDE,
  TASK_CREATION_GUIDE,
  TASK_EXECUTION_GUIDE,
  TASK_FINALIZATION_GUIDE,
};
