# 0005 Single-source task system

Status: done
Priority: high
Owner: user
Agent: Codex
Area: task-system
Parent: none
Depends on: 0001-self-host-task-system
References: none

## Context
TaskLens currently maintains shared task-system instructions twice: once in
the distributable `templates/task-system/` and again as a copied root
installation. The two copies have already drifted.

## Acceptance Criteria
- Shared agent instructions, task contract, and skill workflows have exactly
  one canonical maintained implementation.
- TaskLens agents still discover root `AGENTS.md`, `TASKS/README.md`, and the
  three repo-local skill names.
- Root files contain only TaskLens-specific overlay or canonical references,
  not copied shared workflows.
- `templates/task-system/` remains self-contained and copyable into another
  repository without depending on TaskLens root files.
- Canonical and forwarding skills pass validation and the npm package contains
  the complete starter.

## Implementation Notes
- Keep the distributable template canonical because npm consumers need a
  self-contained directory.
- Prefer portable Markdown forwarding files over symlinks so Windows checkouts
  and packaged templates behave consistently.

## Subtasks
- none

## Agent Notes
- 2026-08-23: Started after confirming root/template drift in the agent rules,
  task contract, and all three skills. Next: reduce root files to discoverable
  overlays/forwarders, retain the template as the single implementation, and
  validate both discovery and package contents. Files touched: this task.
- 2026-08-23: Completed. `templates/task-system/` is now the only maintained
  implementation of shared agent rules, task contract, and skill workflows.
  Root `AGENTS.md` contains only TaskLens-specific policy; `TASKS/README.md`,
  Claude/Copilot instructions, and all three root skill entrypoints are short,
  portable references. No symlinks were used, preserving Windows and npm
  behavior. All six canonical/forwarding skills passed the official validator,
  every forward target resolved, npm pack dry-run contained the complete
  self-contained starter, and whitespace checks passed. No browser inspection
  was needed and no commit was created. No release candidate was added because
  this only consolidates internal instruction ownership. Files touched: root
  agent/task/skill forwarders, README, and this task.
