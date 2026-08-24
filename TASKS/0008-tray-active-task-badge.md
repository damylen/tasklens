# 0008 Add active-task count to macOS app icon

Status: done
Priority: medium
Owner: user
Agent: codex
Area: desktop
Parent: none
Depends on: none
References: none

## Context
The macOS TaskLens icon should show the same `ACTIVE · 1H` count as the web app:
in-progress tasks touched in the last hour. The first implementation only added a title
beside the menu-bar tray icon; the user expects the numeric badge overlaid on
the Dock/application icon shown in the screenshot.

## Acceptance Criteria
- The macOS Dock/application icon displays a native numeric badge.
- The menu-bar tray may continue to display the count beside its icon.
- The count includes `in_progress` tasks touched in the last hour.
- The count updates after live task changes and at least once per minute while
  the app remains open.
- The count covers every mounted project, independent of which project is
  currently selected in the web app.
- Non-Tauri browser use continues to work without errors.

## Implementation Notes
- The webview owns the already-loaded task data and sends the count through a
  small Tauri command; Rust updates both the tray status-item title and the
  main window's native macOS Dock badge.

## Subtasks
- none

## Agent Notes
- 2026-08-24: User clarified that the requested badge belongs in the macOS
  tray, not the web task toolbar. Next: wire the current task store to the
  native tray title and verify a rebuilt desktop app.
- 2026-08-24: Added the `update_tray_active_count` Tauri command and wired the
  webview task store to update the native tray title on renders, live changes,
  and a one-minute interval. The count covers non-wishlist, non-done tasks
  touched in the last two hours. Typecheck and browser build pass; desktop
  build succeeds and the new app is running. Full suite: 79 pass, 5 known
  macOS file-watch timing failures.
- 2026-08-24: Reopened after the screenshot showed the expected surface is the
  macOS Dock/application icon, not only the menu-bar tray title. Local Tauri
  2.11 exposes `WebviewWindow::set_badge_count`; the current native command
  never calls it. Next: establish a native red/green badge signal, update the
  command, rebuild, and verify the running desktop app. Files inspected:
  `desktop/src-tauri/src/main.rs`, `public/app.js`, Tauri's local runtime API.
- 2026-08-24: Confirmed the cause: `update_tray_active_count` only changed the
  menu-bar tray title. Added a native Dock mapping with a red/green Rust test:
  positive counts render numerically and zero clears the badge. Built the
  release `.app`, installed it at `/Applications/TaskLens.app`, and restarted
  that exact binary. Its desktop API reports badge value `2`. The `.app` build
  succeeds; only optional DMG packaging failed in Tauri's `bundle_dmg.sh`.
  Native tests and TypeScript pass; `cargo fmt --check` was unavailable because
  the installed Rust toolchain lacks `rustfmt`. macOS Accessibility does not
  expose Dock badge text, and workspace policy rejected a screenshot, so final
  pixel-level confirmation remains user-visible. The full Bun suite remains at
  79 pass with only the same five known macOS file-watch timing failures;
  whitespace and debug-marker checks pass. Added release candidate
  `macos-active-task-dock-badge`. No commit was created. Files touched:
  `desktop/src-tauri/src/main.rs`, `release-notes/unreleased.yaml`, this task.
- 2026-08-24: Reopened again after the user's new screenshot proved the freshly
  installed app still renders no Dock overlay, despite the desktop API yielding
  count `2`. The previous native mapping test was too shallow: it verified the
  number conversion but not webview IPC or AppKit application. Next: add tagged
  boundary instrumentation, run the real installed app with captured stderr,
  and distinguish a missing invoke from a successful-but-ineffective native
  badge call. Files in scope: `public/app.js`, `desktop/src-tauri/src/main.rs`.
- 2026-08-24: The real instrumented app isolated the failure. Before ACL work,
  the sidecar and webview started but emitted no native command log. A remote
  URL match alone was also insufficient. Registering
  `update_tray_active_count` in Tauri's app manifest and granting only
  `allow-update-tray-active-count` to window `main` at
  `http://127.0.0.1:7532/*` made the real run emit both `command count=1` and
  `dock badge applied count=1`. No core, shell, or updater permissions are
  exposed to the remote origin. Added a focused capability regression test;
  temporary tagged logs were then removed. Files touched: `build.rs`, the new
  localhost capability, `test/desktop-capability.test.ts`, `main.rs`, this task.
- 2026-08-24: Completed the second fix cycle. Built an app-only Tauri bundle,
  applied a complete local ad-hoc signature, verified it with
  `codesign --verify --deep --strict`, installed it to `/Applications`, and
  started that exact app from the Terminal-authorized context. A fresh desktop
  response reports badge value `2`; the instrumented predecessor proved the
  same command reached and completed `set_badge_count`. Native test, capability
  test, TypeScript, whitespace, and debug-marker cleanup pass. Full Bun suite:
  80 pass, with only the same five known macOS file-watch timing failures.
  Caveat: a plain Finder/Dock launch currently stalls the sidecar on Documents
  privacy access; native folder permission/bookmark handling remains separate
  desktop hardening. No commit was created. Files touched: `main.rs`,
  `build.rs`, `capabilities/local-tasklens.json`, the capability test, release
  notes, this task.
- 2026-08-24: Reopened after the badge showed `0` while Overview showed active
  work in another project. A fresh three-backlog server scan reproduced the
  mismatch: the initially selected `local` backlog had zero recent tasks while
  `cs` had recent in-progress tasks. `render()` sends `store.list()` to the
  native badge, and that method returns only the selected backlog. Next: lock
  down a multi-backlog regression and make only the native tray count global.
  Files inspected: `public/app.js`, `public/lib/store.js`, `src/store.ts`,
  `src/workspace.ts`.
- 2026-08-24: Confirmed the root cause with a fresh three-project server: the
  native update used only the initially selected `local` backlog, while
  Overview correctly showed recent work in `cs`. Added `ClientStore.listAll()`
  with a multi-backlog regression and changed both native refresh paths to use
  it. Also consolidated the previously divergent tray rule onto the shared
  `ACTIVE · 1H` definition (`in_progress`, touched within one hour), now used by
  Overview, project chrome, and the Dock badge. Targeted tests and typecheck
  pass; full suite is 81 pass with only the five pre-existing macOS watcher
  timing failures. Rebuilt, ad-hoc signed, strictly verified, installed, and
  started `/Applications/TaskLens.app`. No commit was created. Files touched:
  `public/app.js`, `public/lib/activity.js`, `public/lib/store.js`,
  `public/views/overview.js`, `test/activity.test.ts`,
  `test/client-store.test.ts`, `release-notes/unreleased.yaml`, this task.
