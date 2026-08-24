# 0004 Remove unreleased candidates

Status: done
Priority: high
Owner: user
Agent: Codex
Area: web/releases
Parent: none
Depends on: none
References: none

## Context
The Unreleased view currently reads source-owned change candidates but cannot
remove one. The user wants an explicit UI action that removes a candidate from
its `release-notes/unreleased.yaml`, ensuring it is not available to a later
release workflow.

## Acceptance Criteria
- Every unreleased candidate has a clearly scoped remove action and confirmation.
- Removal deletes only the selected candidate block from its exact source file.
- Source paths cannot escape the configured project root.
- Duplicate ids in different source files remain independently addressable.
- The client refreshes Unreleased immediately after a successful removal.
- Missing candidates and malformed/unsafe sources fail without rewriting files.
- Focused parser, workspace/API, and client behavior are tested.

## Implementation Notes
- Task files remain read-only; this mutation is limited to existing
  `release-notes/unreleased.yaml` candidate sources.
- Identify a candidate by backlog, source-relative path, and source-local id.
- Preserve the remaining file text rather than parsing and serializing all YAML.

## Subtasks
- none

## Agent Notes
- 2026-08-23: Started after clarifying that complete unreleased change
  candidates—not feature links—must be removable. Next: add a bounded
  source-block deletion primitive, expose it through workspace/API/client, then
  add a confirmed action in Unreleased. Files touched: this task.
- 2026-08-23: Completed. Unreleased cards now have a confirmed Remove action
  that addresses the exact backlog/source/id, atomically deletes only that YAML
  candidate block, refreshes every affected local snapshot, and leaves task
  files untouched. Unsafe paths, non-release-note targets, missing or ambiguous
  ids, and malformed candidate files fail before rewriting. Comments and other
  candidate text are preserved. Thirteen focused disk/API/client/UI tests,
  TypeScript, browser bundling, and whitespace checks passed. Full suite: 76
  pass with only the same five known macOS watcher timing failures. No browser
  inspection was performed and no commit was created. Files touched:
  `src/releases.ts`, `src/workspace.ts`, `src/server.ts`,
  `public/lib/store.js`, `public/views/changes.js`, `public/app.css`, README,
  release notes, four focused test files, and this task.
