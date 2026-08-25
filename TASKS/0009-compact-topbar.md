# 0009 Compact topbar on constrained screens

Status: done
Priority: medium
Owner: user
Agent: Codex
Area: web/navigation
Parent: none
Depends on: none
References: none

## Context

The toolbar still occupied too much space on the user's local desktop window.
The earlier responsive breakpoint was too low for high-density displays, so the
full tab groups remained visible when the toolbar was already crowded.

## Acceptance Criteria

- The toolbar uses the dropdown controls earlier on constrained widths.
- The toolbar is shorter and uses tighter spacing without losing controls.
- The local development server is restarted on port 7531.
- The compact project dropdown lists only real projects; Overview is reached
  from the TaskLens brand button.
- Timeline and Home activity text is one readable step larger without changing
  toolbar or project-plane dimensions.

## Implementation Notes

- Keep the existing wide-layout controls, but switch to the dropdown layout at
  1600 CSS pixels to account for Retina/high-density browser windows.

## Subtasks

- none

## Agent Notes

- 2026-08-24: Reduced the toolbar height from 54px to 46px, tightened its
  spacing, and raised the dropdown breakpoint from 1250px to 1600px. Restarted
  the local development server on port 7531 after the change.
- 2026-08-24: Reopened for a readability and navigation refinement. The brand
  already routes to Overview but is a non-semantic clickable `div`; the compact
  project selector also duplicates Overview as an option. Decision: make the
  brand a real button, replace the dropdown's Overview entry with a disabled
  project placeholder, and increase Timeline/Home activity typography by about
  one pixel without changing layout dimensions. Next: add navigation invariant
  coverage, implement, and verify on the running 7534 server.
- 2026-08-24: Implemented the refinement. TaskLens is now a semantic brand
  button to Overview; the compact selector has a disabled `Select project…`
  placeholder on Home and otherwise lists only real projects. Timeline and
  Home activity date, task, note, and agent text increased by one pixel while
  container sizes remain unchanged. Ten focused navigation, shortcut,
  Timeline, and Home tests plus TypeScript and whitespace checks pass. Next:
  run the full suite and verify the files served on port 7534. Files touched:
  `public/app.js`, `public/app.css`, `test/navigation.test.ts`, README, release
  candidate, this task.
- 2026-08-24: Completed verification. Full suite: 96 passed with only the same
  five pre-existing macOS `fs.watch` timing failures. The running TaskLens
  server on `http://127.0.0.1:7534` was confirmed to serve the semantic brand
  button, project-only selector, and larger Timeline/Home typography. Visual
  browser inspection was not performed because it was not explicitly
  requested. No commit was created.
