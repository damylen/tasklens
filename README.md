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

## Watch several backlogs together

Save each backlog once under a short, local name, then start a workspace:

```sh
tasklens backlog add cs ~/work/cs
tasklens backlog add tasklens ~/work/tasklens
tasklens serve
```

`tasklens backlog list` shows the saved names and `tasklens backlog remove <name>` removes one.
The configuration is stored in your user config directory (`~/.config/tasklens/backlogs.json` on
macOS/Linux), never in a project's `TASKS/` folder. At startup TaskLens discovers matching
`TASKS/` folders beneath each configured project once, then watches only those folders. A project
with several independent task folders receives one source tab per task folder.

For a one-off workspace that leaves no configuration behind, repeat `--backlog`:

```sh
tasklens serve --backlog cs=~/work/cs --backlog tasklens=~/work/tasklens
```

The first tab is **Overview**, with a card for every backlog and its status distribution, blocked
count and in-progress work touched in the last hour. Each named tab then opens the usual Kanban,
Timeline, Groups and Files views for that backlog only. Task numbers and task relationships never
cross a backlog boundary, even when folders both contain a task named `0001`.

You can also add a backlog from the **Add backlog** card on Overview. Enter a name and either a
local project or `TASKS/` folder path; TaskLens validates and scans it before starting its watcher. The form writes
the same local configuration as `tasklens backlog add` and shows validation errors without changing
the existing workspace.

Plain `tasklens` remains the quick one-backlog command: it discovers the nearest `TASKS/` directory
and serves it as before.

## Add it to your agent environment

TaskLens shows a backlog; the agents working in the repository still need a
shared rule for keeping it accurate. Add TaskLens locally, then copy the
included starter kit into the root of a project that uses `TASKS/`:

```sh
bun add -d tasklens
cp -R node_modules/tasklens/templates/task-system/. .
```

When working from a clone instead of an installed package, replace
`node_modules/tasklens` with the TaskLens checkout. The kit provides:

- `AGENTS.md` — the canonical workflow, automatically discovered by Codex and
  usable by any coding agent.
- `CLAUDE.md` — tells Claude Code to use that shared workflow.
- `.github/copilot-instructions.md` — makes the same workflow available to
  GitHub Copilot.
- `TASKS/README.md` — documents the task-file contract without becoming a task
  card itself.

Keep project-specific coding, testing, and release instructions in the
project's own agent files; the starter kit only governs shared task tracking.

## Release and npm publishing

Publishing is deliberately tag-only: pushing to `main` never releases a
package. The GitHub Actions workflow checks out a `vX.Y.Z` tag, requires it to
match `package.json`, installs from `bun.lock`, runs `bun run check:release`,
and refuses an npm version that already exists.

Before the first release, the package owner must complete one of these npm
authentication setups:

1. Preferred: in the npm package settings, configure a **Trusted Publisher**
   for GitHub Actions with owner `damylen`, repository `tasklens`, and workflow
   filename `publish.yml`. Allow `npm publish`. This uses short-lived OIDC
   credentials; no token is stored in GitHub.
2. Fallback: create a granular npm automation token limited to this package
   and add it as the GitHub repository secret `NPM_TOKEN`. Remove the secret
   after trusted publishing has been verified.

Protect `v*` tags in GitHub so only release maintainers can create or move
them. Then release a new version from a clean, validated branch:

```sh
# Update package.json and bun.lock as needed, then commit the release change.
bun run check:release
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

The tag starts the workflow; it does not run for ordinary branch pushes. npm
trusted publishing requires a GitHub-hosted runner, `id-token: write`, npm CLI
11.5.1 or newer, and Node 22.14 or newer. The workflow uses Node 24. npm does
not currently produce provenance attestations for packages released from a
private GitHub repository, even when trusted publishing is used.

Consumers can install the released CLI with:

```sh
bun add -g tasklens
tasklens
```

### Native desktop releases

Pushing the same `vX.Y.Z` tag also starts `.github/workflows/desktop-release.yml`.
It builds a native **macOS Apple Silicon** `.dmg` and a **Windows x64** NSIS installer,
then attaches them and their signed updater archives to the GitHub Release. The installed
app starts TaskLens locally and checks the release's `latest.json` manifest at launch; a
valid newer signed update is installed and the app restarts. Its first launch has an empty
Overview, from which you can add local project folders; existing saved folders are kept too.

Before the first desktop tag, add these repository **Actions secrets**:

- `TAURI_UPDATER_PUBKEY` — the public key printed by `bunx tauri signer generate`.
- `TAURI_SIGNING_PRIVATE_KEY` — the complete private key generated by that command.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — its password, if one was chosen.

Generate the key once on a secure machine and keep the private key recoverable: losing it
means existing desktop installations can no longer verify upgrades from a new key. Do not
commit any of these values. The workflow's updater signatures protect in-app upgrades; for
distribution without macOS Gatekeeper or Windows SmartScreen warnings, also configure Apple
Developer signing/notarization and a Windows code-signing certificate in the release runners.

For local desktop development, install the Rust toolchain and run:

```sh
bun install
bun run desktop:dev
```

The normal CLI remains independent: it does not require Rust, Tauri, or desktop secrets.

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
| `Status: wishlist`, `in-progress`, `on_hold`, `investigation complete` | folded onto the matching planning or operational column by keyword; the raw string stays on the task and is shown on the detail page |
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

**Kanban** — five columns, every one of them windowed, so a Done column holding
several thousand cards costs the same as an empty one. Each column collapses to
a narrow rail from its own header and can be hidden entirely from the `COLUMNS`
control; both are remembered per backlog in local storage, so a board comes back
the way you left it. Storage that refuses to work (private browsing, exhausted
quota) degrades to in-memory state rather than breaking the board.

**Timeline** — one row per dated note, newest first, grouped by day. `Show`
switches between all activity, status changes, and completions. Because a note
only records *that* something happened on a date, "status changes" means the
task's newest note — the UI does not pretend the file stores transitions.

**Groups** — the backlog as a graph rather than a list. `By parent` shows
umbrella tasks as a tree with a rollup bar per branch; `By dependency` ranks the
tasks something else is waiting on, real bottlenecks first — an operational task
with open dependants outranks a finished one.

**Files** — which tasks touched which source file. At the top sits a
`CONTENDED` section: files that two or more **operational** tasks are all
pointing at. A finished or wishlist task naming a file is history or planning; several active ones
naming the same file is a collision worth knowing about before you start.

**Task detail** — the rendered sections, the subtask list with each child's real
status, the full note history, and a rail carrying relations, the files the task
names, references and file stats. A file marked in that panel is one other
operational tasks also name; clicking it opens the Files view on that file.

### How files are found

Only backticked spans and markdown link targets count, against a closed list of
extensions. That is deliberate: matching bare prose finds `Three.js`, which is a
library, and `0.7.8`, which is a version. Task cross-references (`TASKS/…`, any
`.md`) are skipped — those are relations and already have edges through
`Parent:` and `Depends on:`.

One file gets written many ways — `Editor.vue`, `src/components/Editor.vue`
and an absolute path can all be one file. A short path folds onto a longer one
when it is a true suffix on segment boundaries **and exactly one maximal
candidate exists**, so a basename that two unrelated trees both use stays two
files instead of being silently merged. Among the spellings of one file, the
representative is the most useful rather than the longest: a repo-relative path
beats an absolute one, which would otherwise win on length and put someone's
home directory in the UI.

### The three chrome rows

The top bar carries identity, navigation, the `TOUCHED` recency control, search
and totals. The filter rail below it carries the shared filters — priority,
`HIDE DONE`, `HIDE WISHLIST`, the area drill-down — plus whatever controls the active view owns.
A third row appears only for views that offer one, holding the wider things that
would otherwise crowd the rail; the timeline puts its notes-per-day chart there.
That row collapses from the chevron at the end of the rail and remembers whether
it was open, per backlog.

### Hiding done work

`HIDE DONE` takes done tasks out of every view at once, which is different from
hiding the kanban's Done column — that only affects the board. One place where
done still shows through: a done umbrella that still has unfinished children
stays visible in `Groups`, because there is no way to show an open child without
its parent. Such a row is always an ancestor of work that passed the filter,
never a leaf.

### Wishlist ideas

`Status: wishlist` records an idea that is intentionally not planned work yet. It has its own
Kanban column and can be hidden independently. Wishlist items stay in search, task detail, groups,
and file history, but are excluded from active-work, blocker, and file-contention signals. Change
the field to `Status: open` when an idea becomes planned work.

### Filtering by recency

The `TOUCHED` control offers `1h`, `4h`, `8h`, `1d`, `2d`, `7d` and `1m`. It
reads **file modification time**, not the dated notes: an Agent Note carries a
date with no clock time, so anything under a day can only come from when the
file was last written. The label says `TOUCHED` rather than something about
activity for exactly that reason.

### Filtering by area

`Area:` is the most useful axis for "which part of the system is this", but it
is free text and a real backlog collects over a thousand distinct values, so the
rail drills one level at a time — pick `web`, then `app`, then `editor` —
with the long tail collapsed into `OTHER` and each level showing its task count.
The selected path is a breadcrumb of chips; clicking one pops back to it. The
area shown on any card, timeline row or group row is itself a control: click it
to filter to that area, click it again to clear.

Whitespace separates the same way a slash does, so `web/app editor` is
`web` > `app` > `editor`. That deliberately also splits prose areas like
`scenario media simulation`, which reads oddly at the deepest level but groups
that work with the rest of `scenario` — which is the point of the axis. Treating
whitespace as literal instead doubled the number of top-level groups on the
backlog this was built against, pushing far more of them out of reach into
`OTHER`.

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

  // optional: compact controls on the right of the filter rail
  toolbar(ctx) {
    return el("button.chip.tiny", { onclick: () => ctx.rerender() }, "REFRESH");
  },

  // optional: a wider strip below the rail, collapsible by the viewer
  detailBar(ctx) {
    return el("div", null, `${ctx.allNotes.length} notes in range`);
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
`"search"`, `"priority"`, `"status"`, `"area"`. Recency is global chrome and
needs no declaration. Declaring none gives a view the rail to itself via
`toolbar()`, and anything too wide for the rail belongs in `detailBar()`. `ctx.toggleArea(path)` is what makes an area
label clickable; a view that shows areas should use `areaLabel()` from
`public/lib/area.js` rather than rendering the string itself.

View state that should outlive a reload goes through `createStore(root)` in
`public/lib/persist.js`. It is namespaced by the backlog path, so a view running
against two folders keeps two sets of state.

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
