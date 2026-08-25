# 0016 Add README screenshots

Status: done
Priority: medium
Owner: user
Agent: codex
Area: documentation
Parent: none
Depends on: none
References: none

## Context
Add the four user-provided TaskLens screenshots to the public README so readers
can see the Timeline, filtering, task detail, and built-in keyboard guide
before installing the app.

## Acceptance Criteria
- All four screenshots are stored as repository-owned documentation assets.
- README renders each screenshot with a clear caption and descriptive alt text.
- Image links resolve to the committed asset paths.

## Implementation Notes
- Store the assets below `docs/images/`, which is already included in the npm
  package.
- Keep the screenshots close to the quick-start section.

## Subtasks
- none

## Agent Notes
- 2026-08-25: Started. The README has no existing screenshot section. Add the
  supplied Timeline overview, release-filtered Timeline, and keyboard guide
  images under `docs/images/`, then link them near the quick start and verify
  the Markdown paths. Files in scope: `README.md`, `docs/images/*.png`, and
  this task.
- 2026-08-25: Scope extended with the user's task-detail screenshot. Add it to
  the same README section and verify it with the other three assets.
- 2026-08-25: Completed. Added a README screenshot section with the Timeline,
  release-filtered Timeline, task detail, and keyboard guide. Replaced the
  original general Timeline image with the user's updated capture. All four
  README paths resolve, source and copied image hashes match,
  `git diff --check` passes, and `npm pack --dry-run` includes every image. The initial
  package check hit an existing unwritable user npm cache; rerunning with a
  temporary cache passed without modifying that cache. No code tests were run
  because this is a documentation-only change. Files touched: `README.md`,
  `docs/images/*.png`, and this task.
