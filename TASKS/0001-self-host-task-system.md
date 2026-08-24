# 0001 Self-host TaskLens task system

Status: done
Priority: medium
Owner: user
Agent: Codex
Area: task-system
Parent: none
Depends on: none
References: none
Features: tasklens:feature-lifecycle

## Context
TaskLens ships a reusable Markdown task-system template, but its own ongoing
work was still tracked from the neighboring CS workspace. Install the template
in this repository and add selective release-candidate guidance so TaskLens can
use and test the same concepts it distributes.

## Acceptance Criteria
- The repository has discoverable agent instructions and a local `TASKS/`
  backlog.
- Repo-local and template skills cover task planning, upgrades, and selective
  release candidates.
- Optional Product Feature links are supported without requiring a feature
  catalog.
- This change has a TaskLens-owned release candidate with task and feature
  provenance.

## Implementation Notes
- Product Features are durable optional capabilities; small tasks usually
  extend an existing feature rather than creating a new one.
- Release candidates are mutable internal release memory, not published
  changelog entries. Only final audience-relevant effects belong there.

## Subtasks
- none

## Agent Notes
- 2026-08-23: Started TaskLens's own task system and candidate workflow. Next:
  add the installed agent files and skills, keep the canonical starter in sync,
  and validate both copies. Files touched: this task.
- 2026-08-23: Chose a clean backlog boundary at the user's direction. Historical
  CS task files are not migrated; TaskLens numbering and provenance start here
  at `0001`. Pre-bootstrap unreleased entries remain without old CS task links.
- 2026-08-23: Completed TaskLens self-hosting. Added root agent definitions,
  a local backlog, repo-specific planning/upgrade/candidate skills, and matching
  generic starter guidance. Added a selective TaskLens-owned candidate linked
  to task `0001` and `tasklens:feature-lifecycle`. All six root/template skills
  passed the official validator; TypeScript, 24 focused tests, browser bundling,
  npm pack dry-run, whitespace checks, and a real one-task/three-candidate scan
  passed with zero warnings. Full suite: 66 pass, with only the five known
  macOS filewatch timing failures. No browser inspection was performed and no
  commit was created. Files touched: root `AGENTS.md`, `CLAUDE.md`, `.github/`,
  `.agents/skills/`, `TASKS/`, starter template, README, and unreleased notes.
