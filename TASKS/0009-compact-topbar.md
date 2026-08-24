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

## Implementation Notes

- Keep the existing wide-layout controls, but switch to the dropdown layout at
  1600 CSS pixels to account for Retina/high-density browser windows.

## Subtasks

- none

## Agent Notes

- 2026-08-24: Reduced the toolbar height from 54px to 46px, tightened its
  spacing, and raised the dropdown breakpoint from 1250px to 1600px. Restarted
  the local development server on port 7531 after the change.
