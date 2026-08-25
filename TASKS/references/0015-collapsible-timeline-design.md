# 0015 Collapsible timeline design

## Current surface

- Outer grouping: one header per note date.
- Inner structure: one full task row per note, even when several notes belong
  to the same task on that date.
- Interaction: clicking anywhere in a note row opens task detail; there is no
  disclosure control and no bulk expand/collapse action.
- Relevant fixed widths: the date/status rail is `132px`; entry gaps are
  `12px`; each note row has `9px 10px 10px 0` padding.

## Decisions

- Preserve date as the outer group so the timeline remains chronological.
- Group by task id inside each date; the stable group key is `date:task-id`.
- Show task identity once in a button-like group header.
- Put that date's note texts below the header when expanded.
- Toggle disclosure independently from the task-detail action.
- Default to expanded; persistence stores only collapsed keys per project.
- Offer `EXPAND ALL` / `COLLAPSE ALL` in the existing timeline toolbar.
- Preserve note order from the existing newest-first store order.
- Home reuses the same grouping keys and `timeline.collapsed` state as Timeline.
- Home keeps its existing per-project 14-note limit and `390px` plane width.
- Home exposes individual task disclosure plus one compact bulk action per
  project plane; it does not embed Timeline's global toolbar.

## Deliberately not decided

- No grouping across dates: one task may appear under several days.
- No new grouping selector (agent, area, status, feature).
- No automatic age-based collapsing.
- No change to the timeline filters, note truncation, or 400-entry limit.
- No redesign of the global toolbar or detail strip.
- No increase to the number of notes rendered on Home.
