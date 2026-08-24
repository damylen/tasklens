# 0007 Remove path field from navigation

Status: done
Priority: medium
Owner: user
Agent: Codex
Area: web/navigation
Parent: none
Depends on: none
References: none

## Context

The active project's filesystem path is shown as a wide path control in the
top navigation bar. It consumes space needed by project navigation and makes
projects difficult to see.

## Acceptance Criteria

- The top navigation no longer renders the active project path control.
- Project tabs and view navigation remain available.
- Project cards continue to show their project path where project context is
  useful.

## Implementation Notes

- Remove only the navigation-bar path display; keep path handling in the
  configuration, API, project form, and project cards unchanged.

## Subtasks

- none

## Agent Notes

- 2026-08-24: Started after the user reported that the path input in the
  navigation prevented projects from being visible. Scope is limited to the
  `rootpath` navigation element and its unused styling. Files in scope:
  `public/app.js`, `public/app.css`, and this task.
- 2026-08-24: Removed the `rootpath` element from the project navigation bar
  and removed its unused CSS. Project tabs remain in the freed space, while
  project cards still show their paths. Focused view/form tests (5), TypeScript
  typecheck, and browser bundling all pass. No commit was created.
