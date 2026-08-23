# Shared task system

`TASKS/` is this repository's shared, durable backlog. Treat it as the source
of truth for active work across humans and coding agents.

## Before changing code

1. Search `TASKS/` for related work before creating anything new. Reuse the
   existing task when it already covers the request.
2. For meaningful work, create the next `NNNN-short-kebab-title.md` task with
   the contract in `TASKS/README.md`.
3. Set its `Status` to `in_progress`, name yourself in `Agent`, and append a
   dated Agent Note describing the intended change and files in scope.

## While working

- Keep task files human-readable Markdown. Do not replace them with a database
  or an agent-specific planning format.
- Record material decisions, verified checks, blockers, and concrete handoff
  information in dated Agent Notes. Append; do not rewrite earlier notes.
- Keep the task's status honest: `wishlist` for uncommitted ideas; `open`,
  `in_progress`, `blocked`, or `done` for planned and active work.
- Create a separate task only when the work has independent ownership,
  sequencing, or verification. Link parent and dependency fields when needed.

## When finishing

1. Run the relevant validation and record the result, including any check that
   could not run or failed for a reason outside the change.
2. Set `Status: done` only after the requested work is genuinely complete.
3. Append a concise final Agent Note with what changed, what was verified, and
   the files touched. Include a commit hash when one exists.

TaskLens only reads this backlog; it never writes task files for you.
