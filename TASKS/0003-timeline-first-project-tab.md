# 0003 Timeline first project tab

Status: done
Priority: medium
Owner: user
Agent: Codex
Area: web/navigation
Parent: none
Depends on: none
References: none

## Context
Project navigation currently registers Kanban before Timeline. The user wants
Timeline to be the first project tab.

## Acceptance Criteria
- Timeline appears before Kanban in the project view switcher.
- Timeline is the default view when no project view is specified.
- Existing explicit Kanban and Timeline routes continue to resolve.
- View-order behavior has a focused regression test.

## Implementation Notes
- The registry deliberately uses registration order for both tab order and the
  default view, so this should remain a one-source ordering change.

## Subtasks
- none

## Agent Notes
- 2026-08-23: Started. Confirmed `public/views/index.js` registration order
  drives both the switcher and `defaultViewId()`. Next: add a focused order test,
  register Timeline first, and validate the browser bundle. Files touched: this
  task.
- 2026-08-23: Completed. Timeline now registers before Kanban, making it both
  the first project tab and the fallback view for routes without an explicit
  view; explicit Timeline and Kanban lookup remains intact. Six focused
  navigation/Overview tests, TypeScript, browser bundling, and whitespace checks
  passed. No browser inspection was performed and no commit was created. Files
  touched: `public/views/index.js`, `test/views.test.ts`,
  `release-notes/unreleased.yaml`, and this task.
