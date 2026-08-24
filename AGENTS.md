# TaskLens repository overlay

Before working in this repository, read and follow the canonical shared task
system in [`templates/task-system/AGENTS.md`](templates/task-system/AGENTS.md).
That template is the single implementation TaskLens uses and distributes.

## TaskLens-specific rules

- Ongoing TaskLens work belongs in this repository's `TASKS/` backlog, not in
  a neighboring workspace.
- Shared task fields, lifecycle rules, task documentation, and skill workflows
  are owned only by `templates/task-system/`. Root files under `TASKS/` and
  `.agents/skills/` are discovery overlays or forwarders; do not copy the
  canonical instructions into them.
- Numbered files under `TASKS/` are TaskLens's repository-owned history and are
  never part of the distributable template.
- Consuming projects retain their own coding, testing, feature-catalog, and
  release-publication rules.

## Validation

- Run focused tests for changed behavior.
- Run `bun run typecheck` for TypeScript changes.
- Run `bun test` before release and report unrelated failures explicitly.
- For browser code, verify
  `bun build public/app.js --outdir <temporary-directory> --target browser`.

Do not commit, tag, publish, or push unless the user explicitly requests it.
