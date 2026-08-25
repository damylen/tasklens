# 0015 Group collapsible timeline tasks

Status: done
Priority: medium
Owner: user
Agent: codex
Area: web/timeline
Parent: none
Depends on: none
References: TASKS/references/0015-collapsible-timeline-design.md

## Context
The timeline already groups activity by day, but repeats the complete task
identity for every note. Group notes by task within each day and let users
collapse those task groups so long activity streams remain scannable.

## Acceptance Criteria
- Timeline notes remain grouped and ordered by day.
- Within a day, notes from the same task render in one task group.
- Each task group can be expanded and collapsed without opening task detail.
- Expand-all and collapse-all controls affect the visible task groups.
- Collapsed groups remain collapsed per project after rerenders and reloads.
- Task detail remains reachable from the task-group header.
- Keyboard and screen-reader semantics identify the toggle state.
- Grouping and persistence behavior have focused regression tests.
- Home project planes use the same date > task > notes hierarchy and shared
  collapsed state within their existing 14-note compact limit.

## Implementation Notes
- Reuse TaskLens's existing namespaced persistence and button patterns.
- Default groups to expanded to preserve the current timeline's information.
- Keep the day as the outer time axis; do not merge one task across dates.

## Subtasks
- none

## Agent Notes
- 2026-08-24: Diagnosed the current timeline and existing collapse patterns.
  The timeline groups by date but renders each note as a full task row. The
  requested grouping is interpreted as date > task > notes, with task-level
  collapse, bulk controls, and project-scoped persistence. DesignSync is not
  available, so the local reference is the design gate fallback. Next: add
  pure grouping/state tests, implement the interaction, then run static UI and
  full checks. Files inspected: `public/views/timeline.js`, `public/app.css`,
  `public/views/kanban.js`, `public/views/groups.js`, `public/lib/persist.js`.
- 2026-08-24: Implemented the date > task > notes hierarchy. Each task has a
  dedicated disclosure control with `aria-expanded`/`aria-controls`, a separate
  task-detail link, and project-scoped collapsed state. Bulk controls modify
  only visible groups and preserve off-screen state. Focused grouping,
  persistence, bulk-action, navigation/disclosure invariant, type, and
  whitespace checks pass. Next: run the full suite and close the task if no new
  failures appear. Files touched: `public/views/timeline.js`, `public/app.css`,
  `test/timeline.test.ts`, `test/persist.test.ts`, `README.md`,
  `release-notes/unreleased.yaml`, design reference, this task.
- 2026-08-24: Completed verification. Focused timeline/persistence/view tests:
  11 passed. TypeScript and `git diff --check` pass. Full suite: 93 passed with
  only the same five pre-existing macOS `fs.watch` timing failures; all
  reconciliation coverage remains green. Visual/browser inspection was not
  performed because workspace policy requires an explicit request. Restarted
  TaskLens 0.2.0 on `http://127.0.0.1:7534` and confirmed that its served
  timeline module contains grouping, disclosure, persistence, and bulk-action
  code. No commit was created.
- 2026-08-24: Reopened at the user's request to apply the same grouping and
  disclosure behavior to Home. Home currently renders up to 14 flat note rows
  in each `390px` project plane. Decision: retain that compact limit, group the
  rows as date > task > notes, share `timeline.collapsed` with Timeline, and add
  a compact per-project bulk action. The existing design reference is extended;
  DesignSync remains unavailable. Next: extract the shared grouping model, add
  Home regressions, implement, and re-run checks. Files inspected:
  `public/views/overview.js`, `public/views/timeline.js`, `public/app.js`,
  `public/app.css`, overview and persistence tests.
- 2026-08-24: Extracted the grouping, bulk-state update, and per-project state
  store to `public/lib/timeline.js`. Home now renders its 14 recent notes as
  compact date > task > notes groups, shares collapse state with Timeline,
  offers individual and per-project bulk disclosure, and keeps task navigation
  separate. The first red test exposed Home's nested `{ task, note }` shape;
  normalization now happens only at the shared grouping boundary. All 18
  focused Home/Timeline/persistence/form tests, TypeScript, and whitespace
  checks pass. Next: run the full suite and verify the served module. Files
  touched: shared timeline model, both views, `public/app.js`, `public/app.css`,
  overview/timeline tests, README, release candidate, design reference, task.
- 2026-08-24: Completed the Home extension. Full suite: 95 passed with only the
  same five pre-existing macOS `fs.watch` timing failures; focused tests,
  TypeScript, and whitespace checks remain green. The running TaskLens 0.2.0
  server on `http://127.0.0.1:7534` was confirmed to serve Home's shared
  grouping, individual disclosure, bulk controls, and persisted state code.
  Visual/browser inspection was not performed because it was not explicitly
  requested. No commit was created.
