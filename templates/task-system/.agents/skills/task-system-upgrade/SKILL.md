---
name: task-system-upgrade
description: Safely compare and upgrade a project's TaskLens Markdown task-system from the canonical GitHub starter template while preserving local rules and task history.
---

# Task system upgrade

Use this skill when a project needs newer shared TaskLens task-system rules, templates, or agent
instructions. The canonical source is
`https://github.com/damylen/tasklens/tree/main/templates/task-system`; use a release tag or exact
commit instead of `main` when the user needs a reproducible version.

## Boundaries

- The canonical template owns its shared files: `AGENTS.md`, `CLAUDE.md`,
  `.github/copilot-instructions.md`, `TASKS/README.md`, and the skills under
  `.agents/skills/`.
- The project owns its task files (`TASKS/NNNN-*.md`, `TASKS/references/`) and project-specific
  instructions. Never replace, delete, or reformat those as an upgrade side effect.
- `wishlist` means an uncommitted idea. Keep it visible, but never treat it as active, blocked, or
  committed work; changing it to `open` is an explicit planning decision.
- Preserve whether the project uses optional Product Features and release
  candidates. Installing support does not require creating either kind of data.

## Workflow

1. Read the local `AGENTS.md` and task-system files first. Identify local additions that must stay.
2. Fetch the canonical template into a temporary directory at the requested ref (default: `main`)
   and record the resolved Git commit. Do not modify the project during this comparison.
3. Diff every template-owned file against its local counterpart. Files that are absent locally or
   unchanged from the prior managed version can be updated directly. For a locally modified shared
   file, show the diff and preserve the local/project-specific content unless the user explicitly
   chooses a replacement or merge.
4. Before writing, state exactly which files will change and which local rules will be retained.
   An explicit request to upgrade authorizes those scoped writes; fetching and diffing alone does
   not authorize replacement of conflicting local content.
5. After updating, validate the Markdown examples and task-status wording. Record the source ref
   and resolved commit in the project handoff or an upgrade task so the next upgrade has a clear
   baseline.

When bootstrapping a project that has never installed the template, copy only the canonical shared
files. Do not create, rename, or delete numbered task files.
