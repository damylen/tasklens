# 0008 Responsive toolbar dropdowns

Status: done
Priority: medium
Owner: user
Agent: Codex
Area: web/navigation
Parent: none
Depends on: none
References: none

## Context

The toolbar contains project tabs, view tabs, recency chips, search, and
status counters. At narrower widths these controls compete for horizontal
space and become clipped.

## Acceptance Criteria

- Project selection becomes a dropdown when the toolbar is narrow.
- View selection becomes a dropdown when the toolbar is narrow.
- Touched-time filters become a dropdown at smaller widths.
- Wide layouts retain the existing tab and chip controls.
- The browser bundle and focused tests pass.

## Implementation Notes

- Use CSS media queries to switch between the existing controls and native
  selects, keeping one source of truth for each navigation action.
- Hide secondary status text at the narrowest widths so primary navigation and
  search remain usable.

## Subtasks

- none

## Agent Notes

- 2026-08-24: Started after the user reported that the toolbar has too little
  horizontal space. Scope is `public/app.js`, `public/app.css`, focused tests
  if needed, and this task.
- 2026-08-24: Added native dropdown fallbacks for project, view, and touched
  filters at responsive breakpoints. Wide layouts retain the existing tabs and
  chips; narrower layouts hide secondary status text as needed. Five focused
  tests, TypeScript, and the browser bundle all pass. No commit was created.
- 2026-08-24: Reopened after the project dropdown visually reset to Overview
  immediately after selecting another project. The route changes correctly;
  the native select does not honor a `value` attribute and needs its matching
  option marked as selected. Scope includes the project, view, and touched
  dropdowns because all three used the same invalid initialization pattern.
- 2026-08-24: Fixed all toolbar dropdowns by marking the matching native option
  as selected instead of setting an ineffective value attribute on the select.
  Verified in the live local app after reload that project `cs`, view `Timeline`,
  and touched `ALL` remain selected. Five focused tests, TypeScript, and browser
  bundling pass. No commit was created.
