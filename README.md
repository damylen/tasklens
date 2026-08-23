# tasklens

A live dashboard for a markdown `TASKS/` backlog. Install it once, run it in any
folder, and get a kanban board, an activity timeline and a task detail page that
update themselves as agents edit the files.

Built for backlogs that several agents write to at the same time: it reads the
files, never writes them.

```
bun add -g tasklens
cd ~/work/your-repo
tasklens
```

## What it reads

Only `NNNN-*.md` at the root of the tasks directory. Subdirectories are neither
scanned nor watched — in a real backlog `artifacts/` alone can run to hundreds
of megabytes and would swamp the file watcher. `references/` is read lazily, on
demand, when a task detail page asks for it.

The file format is the one used by the local task contract:

```md
# 0042 Add offline draft recovery

Status: open
Priority: high
Owner: unassigned
Agent: unassigned
Area: web/app/editor
Parent: 0031-rework-the-editor-shell
Depends on: none
References: references/0042-research.md

## Context
...

## Acceptance Criteria
- ...

## Subtasks
- [x] 0043 Persist drafts to local storage
- [ ] 0044 Restore a draft after an unclean shutdown

## Agent Notes
- 2026-02-14: what happened, what is next, files touched
```

Nothing here is mandatory. A file missing a field still parses; anything that
had to fall back is reported at startup rather than silently absorbed.

### What it does with the messy parts

Real backlogs are not tidy, so the parser is explicit about the variants it
handles and loud about the ones it cannot.

| Reality | Handling |
|---|---|
| `Status: in-progress`, `on_hold`, `investigation complete` | folded onto the four columns by keyword; the raw string stays on the task and is shown on the detail page |
| `Status:` missing or unreadable | filed under Open **and** reported in the startup warnings |
| `Agent: Alice` vs `alice` | case-folded into one bucket for display |
| `Area: web/app editor` | treated as a path — `/` and whitespace both separate, so this is `web` > `app` > `editor` |
| `Area: a, b` | a task can sit in several areas and appears under each |
| `Parent: 1949-rehost.md`, `Depends on: 0466, 0468-awp` | normalized to bare numbers |
| Two files claiming the same number | **both kept.** The filename is the identity, not the number. Both are flagged `DUPLICATE NUMBER` and reported at startup |
| `- 2026-02-14 Alice:` / `(Bruno):` / no colon at all | all read; the trailing name overrides the header `Agent` for that entry |
| Notes wrapped over indented lines | joined onto the entry above instead of dropped |
| A subtask number with no matching file | shown as a row marked `NO FILE` rather than quietly omitted |

Two things are **derived**, because the files cannot express them:

- **Reverse edges.** A file records what it depends on, never what depends on
  it. The `BLOCKS` panel is computed across the whole set.
- **Subtask rollups.** Counted from the child files' own `Status`, not from the
  parent's checkboxes — a hand-maintained checkbox drifts, the child file does
  not. Children are found in both directions: listed under `## Subtasks`, or
  naming the task in their own `Parent:` field.

Activity dates come from the dated `## Agent Notes` entries. File mtime is used
only to order entries within a day and to flash a card that just changed — never
as the activity date itself.

## Views

**Kanban** — four columns, filtered by priority and agent. Every column is
windowed, so a Done column with several thousand cards costs the same as an
empty one. The Done column can be switched between `List`, a collapsed `Rail`,
and `Hide`.

**Timeline** — one row per dated note, newest first, grouped by day. `Show`
switches between all activity, status changes, and completions. Because a note
only records *that* something happened on a date, "status changes" means the
task's newest note — the UI does not pretend the file stores transitions.

**Groups** — the backlog as a graph rather than a list. `By parent` shows
umbrella tasks as a tree with a rollup bar per branch; `By dependency` ranks the
tasks something else is waiting on, real bottlenecks first — an unfinished task
with open dependants outranks a finished one.

**Task detail** — the rendered sections, the subtask list with each child's real
status, the full note history, and a rail carrying relations, references and
file stats.

### Filtering by area

`Area:` is the most useful axis for "which part of the system is this", but it
is free text and a real backlog collects over a thousand distinct values, so the
rail drills one level at a time — pick `web`, then `app`, then `editor` —
with the long tail collapsed into `OTHER` and each level showing its task count.
The selected path is a breadcrumb of chips; clicking one pops back to it.

Areas also drift between `/` and `-` as separators. A dashed head token folds
onto its slash form **only when both halves independently exist as a real path
elsewhere in the set**: `web-app` folds onto `web/app` because `web` is a group
and `app` is a known child of it, while `design-system` and `ci-cd` are left
alone because `design` and `ci` are not groups. The number of names folded is
reported at startup, so the folding is visible rather than silent.

## Adding a view

Views are a registry. The chrome — brand, path, switcher, search, filter chips —
is generic and driven by what each view declares, so adding one never means
touching the chrome.

1. Write `public/views/burndown.js`:

```js
import { el } from "../lib/dom.js";

export default {
  id: "burndown",              // URL segment: #/burndown
  label: "Burndown",           // switcher label
  filters: ["search", "agent"], // shared controls to show

  mount(ctx) {
    return el("div.body", null, `${ctx.tasks.length} tasks match`);
  },

  // optional: re-render in place instead of remounting
  update(root, ctx) {
    root.textContent = `${ctx.tasks.length} tasks match`;
  },

  // optional: controls on the right of the filter rail
  toolbar(ctx) {
    return el("button.chip", { onclick: () => ctx.rerender() }, "REFRESH");
  },

  // optional: release anything mount() held
  destroy(root) {},
};
```

2. Add one line to `public/views/index.js`:

```js
import burndown from "./burndown.js";
register(burndown);
```

That is the whole change. Order in that file is switcher order, and the first
entry is the default view.

`ctx` carries `tasks` (filtered), `allTasks`, `notes` (filtered, newest first),
`allNotes`, `byId`, `resolve(number)`, `filters`, `setFilter`, `openTask(id)`,
`goBack`, `rerender`, `meta` and `store`. The full contract is documented in
[`public/lib/registry.js`](public/lib/registry.js).

`filters` lists the shared controls the chrome should render for that view:
`"search"`, `"priority"`, `"area"`. Declaring none gives a view the rail to
itself via `toolbar()`.

## Live updates

The server pushes deltas over SSE at `/api/events`. A change ships its whole
neighbourhood — edit a child and its parent arrives too, so the parent's rollup
never goes stale. The browser refetches the full set whenever the stream opens
or reconnects, so a dropped connection resyncs instead of drifting.

Freshness rests on two mechanisms, deliberately:

- **`fs.watch`** gives sub-second latency, and is treated as a hint only. On
  macOS it stops reporting further changes to a file once that file has been
  replaced by a rename — which is what `sed -i` and most editors' atomic save
  do. Relying on it alone left the dashboard frozen while still showing a live
  indicator.
- **A periodic mtime sweep** (every 3s) is the actual guarantee. It compares
  every file's mtime and size against what is loaded and repairs anything the
  watcher missed. Over a few thousand files an idle sweep costs a couple of
  milliseconds, and it stays silent when nothing changed.

## Running in several folders

Each instance takes the next free port from 4321, so you can leave one running
per repo without assigning ports yourself.

```
tasklens                     # TASKS/ found from here, or from a parent directory
tasklens ~/work/another-repo # somewhere else
tasklens --port 5000         # pin it
tasklens --no-open           # do not open a browser
tasklens --host 0.0.0.0      # bind another interface
```

The directory is resolved by looking for `TASKS/` (or `tasks/`) beside the
current directory, then the current directory if it is itself a tasks directory,
then the nearest one in a parent — so it works from anywhere inside a repo.

## HTTP API

| Route | Returns |
|---|---|
| `GET /api/tasks` | every task plus `meta` (counts, warnings, root) |
| `GET /api/tasks/:key` | one task by id or number, plus `alternatives` when a number is ambiguous |
| `GET /api/reference?path=` | a reference file, resolved inside the tasks root only |
| `GET /api/events` | SSE stream: `hello`, then `change` frames |

## Development

```
bun install
bun run bin/tasklens.js ../your-repo --no-open
bun test
bun run typecheck
```

There is no build step. The frontend is plain ES modules served as-is.

## Limits

- Bun only — the CLI uses `Bun.serve` and runs TypeScript directly.
- Read-only. It never writes to your task files.
- A bare URL containing a comma in a `References:` list is split into two
  entries; it is indistinguishable from two references, and guessing would
  break the common case.
- One browser per instance is the assumption; nothing is shared between viewers.

## Licence

MIT
