# 0002 Preserve add-project form

Status: done
Priority: high
Owner: user
Agent: Codex
Area: web/overview
Parent: none
Depends on: none
References: none

## Context
While entering a new project on Overview, the form unexpectedly resets. The
live client rerenders Overview when its store emits, so an SSE load, reconnect,
or task change may replace the form DOM while the user is typing.

## Acceptance Criteria
- A workspace refresh does not discard partially entered project name or path.
- A workspace refresh restores the active field and its cursor/selection.
- Successful submission still adds and scans the project.
- Failed submission keeps the entered values available for correction.
- A deterministic regression test covers the reset trigger.

## Implementation Notes
- Diagnose at the real Overview render/store notification seam before changing
  state ownership.
- Preserve draft input only; do not persist local filesystem paths beyond the
  current page session unless explicitly required.

## Subtasks
- none

## Agent Notes
- 2026-08-23: Started diagnosis after the form reset was reported on the new
  local server. Next: build a deterministic rerender reproduction, rank and
  test causes, then apply the smallest state-ownership fix if confirmed. Files
  touched: this task.
- 2026-08-23: Confirmed the cause with a deterministic real-render harness:
  every store emission rebuilt Overview, while the draft lived only in the
  replaced input nodes. Moved name, path, pending state, and errors into
  page-session memory outside the DOM. Live rerenders now preserve input;
  failures keep values and show their error; success sends the captured values
  and then clears the form. Added three regression tests. Focused Overview and
  workspace tests passed (8), TypeScript and browser bundling passed, and the
  full suite has 69 passes with only the same five known macOS watcher timing
  failures. No browser inspection was performed and no commit was created.
  Files touched: `public/views/overview.js`, `public/app.js`,
  `test/overview-form.test.ts`, `release-notes/unreleased.yaml`, and this task.
- 2026-08-23: Reopened after the user confirmed that live rerenders still lose
  input focus. The values are now durable, but replacing the input node also
  replaces the browser's active element. Next: lock field and cursor restoration
  down at the Overview render seam. Files touched: this task.
- 2026-08-23: Completed the focus follow-up. Overview now captures focus only
  when the active element is one of the add-project fields and restores the
  same field, cursor range, and selection direction after its live DOM rebuild.
  It does not restore focus after navigation or when another control was active.
  Four form regressions and nine focused Overview/workspace tests pass;
  TypeScript, browser bundling, whitespace checks, and debug-marker cleanup
  pass. Full suite: 70 pass with only the same five known macOS watcher timing
  failures. No browser inspection was performed and no commit was created.
  Files touched: `public/views/overview.js`, `public/app.js`,
  `test/overview-form.test.ts`, `release-notes/unreleased.yaml`, and this task.
