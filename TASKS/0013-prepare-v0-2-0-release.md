# 0013 Prepare v0.2.0 release

Status: done
Priority: high
Owner: user
Agent: Codex
Area: release
Parent: none
Depends on: none
References: release-notes/v0.2.0.md

## Context

Prepare the first feature release after v0.1.0 from the accumulated selective
change candidates and completed navigation and desktop work.

## Acceptance Criteria

- Public release notes are written in English and consolidate the selected
  change candidates into clear audience-facing sections.
- Package, CLI, and desktop versions are aligned at 0.2.0.
- Consumed unreleased candidates are cleared.
- Release validation passes.
- The completed release is committed and tagged locally as v0.2.0.
- No remote push or publication is performed.

## Implementation Notes

- Include the completed responsive toolbar, path removal, compact top bar, and
  macOS menubar work that had not yet been recorded as standalone candidates.
- Use one release commit and an annotated tag.

## Subtasks

- none

## Agent Notes

- 2026-08-24: Started release preparation after the user approved the English
  release preview and explicitly requested a commit and tag. Next: run the
  complete release validation, record the outcome here, and create the local
  release commit and annotated tag. Files touched: version sources, README,
  release notes, and this task.
- 2026-08-24: Completed the English v0.2.0 release notes, aligned the package,
  CLI, and native desktop versions, and consumed the unreleased candidates.
  TypeScript, the browser bundle, Rust `cargo check`, CLI version output, npm
  pack dry-run, whitespace checks, and 89 non-watcher tests pass. The same five
  known macOS/Bun `fs.watch` timing tests fail consistently before npm packing;
  reconciliation coverage passes and the failure is unrelated to this release
  preparation. The npm dry-run also passes with a temporary cache because the
  user's global npm cache contains pre-existing root-owned files. Next: create
  the requested release commit and local annotated v0.2.0 tag; report their
  identifiers in the handoff. Files touched: accumulated v0.2.0 implementation,
  tests and task-system files, version sources, README, release notes, and this
  task.
