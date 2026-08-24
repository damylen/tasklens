# 0010 Keyboard navigation shortcuts

Status: done
Priority: medium
Owner: user
Agent: Codex
Area: web/navigation
Parent: none
Depends on: none
References: none

## Context

Project and view switching currently requires pointer interaction. The user
wants direct keyboard navigation with clear visual confirmation of each switch.

## Acceptance Criteria

- Number keys 1 through 9 select projects in displayed order when available.
- T, K, G, F, and U open Timeline, Kanban, Groups, Files, and Unreleased.
- O opens Overview and `/` focuses task search when search is available.
- Shortcuts do not trigger while typing in an input, textarea, select, or
  editable element.
- Every handled shortcut shows a prominent animated switch indicator centered
  in the viewport.
- Shortcut resolution has focused tests and the interactions are verified in
  the local browser app.

## Implementation Notes

- Keep key resolution pure and testable; browser state changes remain in the
  app-level keydown handler.
- Features has no shortcut because the requested view-key set does not include
  a distinct mnemonic for it.

## Subtasks

- none

## Agent Notes

- 2026-08-24: Started. Implementing the requested project, view, Overview, and
  search shortcuts with editable-field guards and a central animated HUD.
  Files in scope: `public/app.js`, `public/app.css`, a small shortcut helper,
  focused tests, and this task.
- 2026-08-24: Completed the requested shortcuts and animated central switch
  HUD. Live browser verification covered project `2`, view `K`, Overview `O`,
  search `/`, and suppression while typing; the HUD was visually inspected on
  `G — GROUPS`. Eight focused tests pass, along with TypeScript and browser
  bundling. Added a selective unreleased candidate and created no commit.
