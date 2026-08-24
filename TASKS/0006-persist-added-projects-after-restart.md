# 0006 Persist added projects after restart

Status: done
Priority: high
Owner: user
Agent: codex
Area: cli
Parent: none
Depends on: none
References: none

## Context
Projects added from the Overview are written to TaskLens's local backlog configuration, but disappear after restarting a direct `tasklens [directory]` session because that startup path ignores the saved configuration.

## Acceptance Criteria
- Projects added from the web app are restored after restarting `tasklens [directory]`.
- The discovered local project remains first and wins conflicts with saved configuration.
- Explicit `--backlog` and `--empty` invocations keep their current one-off behavior.
- A regression test covers restoring a web-added project during direct startup.
- The documented startup behavior matches the implementation.

## Implementation Notes
- Reuse the existing TaskLens configuration file; do not introduce browser-only persistence.
- Deduplicate restored projects by id and resolved directory.

## Subtasks
- none

## Agent Notes
- 2026-08-23: Confirmed that the web endpoint saves `workspace.configuredBacklogs()`, while `src/cli.ts` only loads saved backlogs for `serve`. Next: add a focused failing startup regression test, implement the merge, and verify restart behavior. Files inspected: `src/cli.ts`, `src/server.ts`, `src/config.ts`, `test/workspace.test.ts`, `README.md`.
- 2026-08-23: Added `restoreSavedBacklogs()` and direct-start integration. The local project stays first and wins id/path conflicts; saved Overview projects follow. Added two CLI regression tests and updated the README. Focused tests (10/10) and typecheck pass. Next: verify the real saved configuration, full suite, and live restart. Files touched: `src/cli.ts`, `test/cli.test.ts`, `README.md`.
- 2026-08-23: The saved config currently contains a stale `cs` entry pointing at the same TaskLens directory; startup correctly deduplicates it and leaves `cs` available to re-add with its intended path. Initial live-start attempts were blocked because the execution sandbox reports local TCP binds as `EADDRINUSE`; no speculative port lifecycle change was retained. Next: start with approved local network access. Files touched: this task.
- 2026-08-23: Completed. Directory-based startup now restores Overview-added projects from the existing local config, keeps the discovered local project first, and deduplicates conflicts by stable id and resolved path. Explicit `--backlog` and `--empty` behavior is unchanged. Added two focused startup tests and README guidance plus release candidate `restore-web-added-projects`. The repaired server is running on port 7534. Focused tests (10/10), typecheck, and whitespace checks pass. Full suite: 79 pass; only the same five known macOS filewatch timing tests fail. The existing stale `cs` duplicate remains safely ignored so it can be re-added with the intended path. No browser inspection was performed and no commit was created. Files touched: `src/cli.ts`, `test/cli.test.ts`, `README.md`, `release-notes/unreleased.yaml`, and this task.
