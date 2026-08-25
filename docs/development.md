# TaskLens developer documentation

## Development

```sh
bun install
bun run bin/tasklens.js ../your-repo --no-open
bun test
bun run typecheck
```

There is no frontend build step. The frontend is plain ES modules served as-is.

## Adding a view

Views are a registry. The chrome — brand, path, switcher, search, filter chips —
is generic and driven by what each view declares, so adding one never means
touching the chrome.

1. Write `public/views/burndown.js`:

```js
import { el } from "../lib/dom.js";

export default {
  id: "burndown",               // URL segment: #/burndown
  label: "Burndown",            // switcher label
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
[`public/lib/registry.js`](../public/lib/registry.js).

`filters` lists the shared controls the chrome should render for that view:
`"search"`, `"priority"`, `"status"`, `"area"`. Recency is global chrome and
needs no declaration. Declaring none gives a view the rail to itself via
`toolbar()`, and anything too wide for the rail belongs in `detailBar()`.
`ctx.toggleArea(path)` is what makes an area label clickable; a view that shows
areas should use `areaLabel()` from `public/lib/area.js` rather than rendering
the string itself.

View state that should outlive a reload goes through `createStore(root)` in
`public/lib/persist.js`. It is namespaced by the backlog path, so a view running
against two folders keeps two sets of state.

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
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
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

Starting TaskLens with `tasklens` or `tasklens <directory>` opens the discovered
local project first and also restores projects previously added from Overview.
Use repeated `--backlog <name=dir>` options for an isolated one-off workspace,
or `--empty` to start without any configured project.

## Native desktop releases

Pushing the same `vX.Y.Z` tag also starts
`.github/workflows/desktop-release.yml`. It builds a native **macOS Apple
Silicon** `.dmg` and a **Windows x64** NSIS installer, then attaches them and
their signed updater archives to the GitHub Release. The installed app starts
TaskLens locally and checks the release's `latest.json` manifest at launch; a
valid newer signed update is installed and the app restarts. Its first launch
has an empty Overview, from which you can add local project folders; existing
saved folders are kept too.

Before the first desktop tag, add these repository **Actions secrets**:

- `TAURI_UPDATER_PUBKEY` — the public key printed by
  `bunx tauri signer generate`.
- `TAURI_SIGNING_PRIVATE_KEY` — the complete private key generated by that
  command.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — its password, if one was chosen.

Generate the key once on a secure machine and keep the private key recoverable:
losing it means existing desktop installations can no longer verify upgrades
from a new key. Do not commit any of these values. The workflow's updater
signatures protect in-app upgrades; for distribution without macOS Gatekeeper
or Windows SmartScreen warnings, also configure Apple Developer signing and
notarization and a Windows code-signing certificate in the release runners.

For local desktop development, install the Rust toolchain and run:

```sh
bun install
bun run desktop:dev
```

The normal CLI remains independent: it does not require Rust, Tauri, or desktop
secrets.
