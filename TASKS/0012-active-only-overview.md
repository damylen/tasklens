# 0012 Active-only Overview

Status: done
Priority: medium
Owner: user
Agent: Codex
Area: web/overview
Parent: none
Depends on: none
References: none

## Context

The ACTIVE · 1H badge reports recently touched in-progress work but cannot be
used to inspect that work directly. The user wants both the A key and the badge
itself to open an active-only Overview.

## Acceptance Criteria

- A opens Overview with only active projects and activity, and toggles the
  filter when already on Overview.
- Clicking ACTIVE · 1H has the same behavior.
- Active means in-progress and touched in the last hour, matching the badge.
- The active state is visually clear and an empty state handles zero results.
- O and ordinary Overview navigation return to the full Overview.
- Focused tests and live browser verification cover the behavior.

## Implementation Notes

- Keep the filter session-only; it is a navigation mode rather than a saved
  project filter.

## Subtasks

- none

## Agent Notes

- 2026-08-24: Started. Scope covers the shared active predicate, Overview
  filtering, A shortcut, clickable badges, HUD/help copy, tests, and browser QA.
- 2026-08-24: Completed. A and the ACTIVE · 1H badges now toggle an Overview
  containing only projects and note activity for recently touched in-progress
  tasks; O and ordinary Overview navigation restore all activity. Live browser
  verification covered keyboard activation, keyboard toggle, badge click, O
  reset, selected-state styling, counts, and project reduction. Ten focused
  tests, TypeScript, browser bundling, and whitespace checks pass. Updated the
  selective unreleased candidates and created no commit.
