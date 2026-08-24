---
name: local-task-planning
description: Create and maintain repo-local TASKS markdown plans for project work, including right-sized task files, optional parent/subtask structure, reference material, acceptance criteria, and resumable agent notes. Use when a user asks to create, update, split, prioritize, or document project work in TASKS/.
---

# Local Task Planning

Use this skill when work should be recorded in the repo-local `TASKS/` backlog for Codex, Codex, and Copilot.

## Workflow

1. Search `TASKS/` first with `rg` for related work. Prefer updating an existing task over creating duplicates.
2. For meaningful new work, create the next `NNNN-short-kebab-title.md` file using the local task contract.
3. Keep the task file actionable. Put long background, transcripts, design references, and domain summaries in `TASKS/references/`.
4. Right-size the task structure before creating child tasks. Use one task for small or straightforward work, even when it has a few checklist items. Create an umbrella task plus subtasks only when the work is genuinely large-scale, multi-step, cross-agent, or has distinct implementation/verification surfaces. Link both directions when subtasks are justified:
   - umbrella task lists child tasks under `Subtasks`
   - child task uses `Parent: NNNN-title` and `Depends on:` when sequencing matters
5. Update `Status`, `Owner`, `Agent`, and `Agent Notes` as work progresses.
6. Record blockers and next concrete handoff steps in the task file before stopping.
7. Use an optional `Features:` field only when the project has stable Product
   Feature ids and the task materially contributes to one. Reuse an existing
   feature for small extensions; do not invent feature ids as task labels.

## Task Contract

Use this base shape:

```md
# 0001 Short title

Status: open
Priority: medium
Owner: unassigned
Agent: unassigned
Area: general
Parent: none
Depends on: none
References: none
Features: example:sharing, example:export

## Context
...

## Acceptance Criteria
- ...

## Implementation Notes
- ...

## Subtasks
- none

## Agent Notes
- ...
```

Omit `Features:` in projects without a feature catalog or when the task has no
meaningful feature relationship. Feature metadata does not make a task a
release candidate.

## Reference Material

Use `TASKS/references/NNNN-short-topic.md` when material is useful for implementation but too long for the task:

- extended summaries
- design notes
- schema maps
- research excerpts
- user-provided scripts or scenarios
- implementation audits

Reference files should be Markdown, human-editable, and linked from the parent task using `References:`.

## Subtasks

Default to a single task. Create subtasks only when the parent task is genuinely too broad to execute or review as one unit.

Subtasks are appropriate when a project has independent ownership, substantial sequencing, or separate verification surfaces.

Good subtask boundaries:

- schema audit
- backend/tool implementation
- client UI slice
- tests/evals
- migration/data seed
- documentation or operator workflow

Avoid subtasks for:

- tiny checklist items that fit naturally in the parent task's acceptance criteria
- small schema/config/UI edits that one agent can finish in one pass
- steps whose only purpose is to mirror a short implementation sequence
- speculative later work that can be noted under `Implementation Notes` instead

When unsure, keep the work in one task and add a `Follow-ups` or `Implementation Notes` section. Split later only after the task proves too large or blocked by independent ownership.
