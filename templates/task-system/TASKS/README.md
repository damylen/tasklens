# Tasks

This directory is the shared, Markdown-based backlog for people and coding
agents. TaskLens reads only `NNNN-*.md` files at this directory's root; this
README is intentionally not a task.

Create tasks as `NNNN-short-kebab-title.md` using this contract:

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

## Context
...

## Acceptance Criteria
- ...

## Implementation Notes
- ...

## Subtasks
- none

## Agent Notes
- YYYY-MM-DD: what changed, what was verified, and what remains
```

Use `open`, `in_progress`, `blocked`, and `done` as statuses. Preserve task
history by appending Agent Notes instead of overwriting them.
