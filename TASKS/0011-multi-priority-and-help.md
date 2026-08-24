# 0011 Multi-priority filters and help popup

Status: done
Priority: medium
Owner: user
Agent: Codex
Area: web/navigation
Parent: none
Depends on: none
References: none

## Context

Priority filtering currently permits only one value and the compact interface
does not explain its views, filters, or keyboard controls. The user also wants
a direct keyboard toggle for done-task visibility.

## Acceptance Criteria

- Several priority chips can be active together and match tasks with any
  selected priority.
- ALL clears the priority selection and an empty selection means all priorities.
- Priority selection is remembered per project and safely restores old values.
- D toggles done-task visibility without firing while typing.
- A toolbar info button opens an accessible popup explaining TaskLens, its
  filters, and every keyboard shortcut.
- Focused tests and live browser verification cover the new behavior.

## Implementation Notes

- Interpret the requested D toggle as the existing Done visibility filter.
- Keep shortcut feedback consistent with the central animated HUD.

## Subtasks

- none

## Agent Notes

- 2026-08-24: Started. Scope covers priority filter state/rendering, the D
  shortcut, a toolbar information dialog, focused tests, and browser validation.
- 2026-08-24: Completed. Priority chips now combine with any-match semantics,
  ALL clears them, and CRITICAL+LOW survived a live reload before test state was
  restored. D toggles Done visibility with the central HUD. Added and visually
  verified the responsive toolbar guide; shortcuts are suppressed while it is
  open and its close control works. Eleven focused tests, TypeScript, browser
  bundling, and whitespace checks pass. Updated selective unreleased candidates
  and created no commit.
