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
- YYYY-MM-DD: what changed, what was verified, and what remains
```

Use `wishlist` for an idea that is not ready to plan, then promote it to `open`
when it becomes intended work. `in_progress`, `blocked`, and `done` describe
the operational lifecycle. Preserve task history by appending Agent Notes instead
of overwriting them.

Projects that maintain stable Product Features may add an optional
comma-separated field such as `Features: example:sharing, example:export` to a
task. Leave it out when the project does not use features; it is not required
for task tracking or release candidates. Reuse existing feature ids: a small
extension normally belongs to its durable parent feature rather than becoming
a new feature.

Finishing a task does not automatically put it in a changelog. For a final
change noticeable to users, operators, or client developers, the
`release-candidate` skill can add or update mutable release memory in
`release-notes/unreleased.yaml`. Internal refactors, audits, tests, and
unfinished work normally stay out. Final selection and wording happen when a
release is prepared.
