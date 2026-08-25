# 0014 Move developer documentation out of README

Status: done
Priority: medium
Owner: user
Agent: Codex
Area: documentation
Parent: none
Depends on: none
References: docs/development.md

## Context

The public README contains contributor and release-maintainer instructions that
make the product introduction unnecessarily long. The user wants release, native
desktop, and view-extension documentation moved to a developer document.

## Acceptance Criteria

- README no longer contains the Release and npm publishing section.
- README no longer contains the Native desktop releases section.
- README no longer contains the Adding a view section.
- The moved content remains available in a dedicated developer Markdown file.
- README links clearly to the developer document.

## Implementation Notes

- Keep the existing instructions intact while correcting relative links for the
  new `docs/` location.

## Subtasks

- none

## Agent Notes

- 2026-08-24: Completed. Moved contributor setup, view extension, npm release,
  and native desktop release guidance to `docs/development.md`. Replaced the
  README development block with a concise link and corrected source links for
  the document's new location. Included `docs/` in the published npm package so
  the README link remains valid for installed package sources. Verified the
  three requested headings no longer occur in README, all local Markdown
  targets resolve, the npm pack includes the developer document, and whitespace
  checks pass. No commit was created. Files touched: `README.md`, `package.json`,
  `docs/development.md`, and this task.
