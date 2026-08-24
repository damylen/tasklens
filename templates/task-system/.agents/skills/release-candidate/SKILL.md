---
name: release-candidate
description: Add or update a selective unreleased change candidate when completed work has a final, release-relevant effect for users, operators, or client developers. Use at task close or when curating mutable release notes; do not use it to publish a changelog.
---

# Release Candidate

Capture useful release memory without turning task history into public
documentation.

## Decide first

Read the completed task, final diff, and validation results. Create or update a
candidate only when the final effect matters to a release audience:

- a user-visible capability or behavior change
- an operator-facing deployment, configuration, or reliability change
- a client-developer-facing API, integration, or supported workflow change

Normally exclude internal refactors, audits, test-only work, documentation of
unchanged behavior, abandoned approaches, and unfinished functionality. A done
task is evidence, not automatically a candidate.

## Record the candidate

Use the owning repository's `release-notes/unreleased.yaml`. Preserve existing
entries and its `schemaVersion: 1` structure. Before adding anything, search for
an entry covering the same final change and update it instead of creating a
duplicate.

Use this compact shape:

```yaml
- id: stable-kebab-id
  date: YYYY-MM-DD
  type: feature
  summary: Concise final effect in audience language.
  details: Optional context that helps later release curation.
  tasks: [42]
  features: [example:sharing]
```

`id`, `date`, `type`, `summary`, and `tasks` are expected. Use an inline list
for task numbers without zero padding. `details` and `features` are optional.
Link only existing stable feature ids; omit `features` when the project has no
feature catalog or the relationship is unclear. A small change usually extends
an existing durable feature rather than defining a new one.

Describe the final relevant behavior, not implementation chronology. If the
implementation changed direction, rewrite the existing candidate to match the
result and remove superseded claims.

## Boundary

Candidates are mutable internal inputs to a later release process. Do not
publish a changelog, assign a release version, clear unreleased entries, or
expand feature documentation unless the user or the repository's release
workflow explicitly requests it.
